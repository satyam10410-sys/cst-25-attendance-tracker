const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();
console.log("🔧 AI Key Loaded:", !!process.env.GEMINI_API_KEY);
const { GoogleGenAI } = require('@google/genai');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET is not set. Add it to your .env file before starting the server.');
    process.exit(1);
}

if (!process.env.DB_PASSWORD) {
    console.error('FATAL: DB_PASSWORD is not set. Add it to your .env file before starting the server.');
    process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // Fixes the rate-limit warning behind Render's proxy

app.use(helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https://cdn-icons-png.flaticon.com'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            scriptSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"]
        }
    }
}));

app.use(cors());
app.use(express.json());

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
app.use('/api/login', limiter);

const journalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many reflections submitted. Please slow down and try again later.' }
});
app.use('/api/journal', journalLimiter);

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,       // Added port variable
    ssl: { rejectUnauthorized: false }, // Forces SSL connection for Aiven
    waitForConnections: true,
    connectionLimit: 10
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const courseColumnMap = {
    ch2101: 'ch2101',
    ch2102: 'ch2102',
    ch2103: 'ch2103',
    ch2104: 'ch2104',
    ch2105: 'ch2105',
    hs21pq: 'hs21pq'
};

const failedAttempts = new Map(); 
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

function isAccountLocked(roll) {
    const entry = failedAttempts.get(roll);
    if (!entry || !entry.lockUntil) return false;
    if (entry.lockUntil <= Date.now()) {
        failedAttempts.delete(roll);
        return false;
    }
    return true;
}

function recordFailedAttempt(roll) {
    const entry = failedAttempts.get(roll) || { count: 0, lockUntil: null };
    entry.count += 1;
    if (entry.count >= MAX_FAILED_ATTEMPTS) {
        entry.lockUntil = Date.now() + LOCK_DURATION_MS;
    }
    failedAttempts.set(roll, entry);
}

function clearFailedAttempts(roll) {
    failedAttempts.delete(roll);
}

app.post('/api/login', async (req, res) => {
    const { roll, password } = req.body || {};

    if (!roll || !password) {
        return res.status(400).json({ success: false, message: 'Roll number and password are required.' });
    }

    const formattedRoll = roll.trim().toUpperCase();

    if (isAccountLocked(formattedRoll)) {
        return res.status(429).json({ success: false, message: 'Too many failed attempts. Try again later.' });
    }

    try {
        const [rows] = await pool.query('SELECT * FROM user WHERE LOWER(roll) = LOWER(?)', [formattedRoll]);

        if (rows.length > 0) {
            const user = rows[0];
            const match = await bcrypt.compare(password, user.password);

            if (match) {
                clearFailedAttempts(formattedRoll);
                const token = jwt.sign({ roll: user.roll }, JWT_SECRET, { expiresIn: '24h' });
                res.json({ success: true, token, user: { name: user.name, roll: user.roll, email: user.email } });
            } else {
                recordFailedAttempt(formattedRoll);
                res.status(401).json({ success: false, message: 'Invalid Roll Number or Password!' });
            }
        } else {
            recordFailedAttempt(formattedRoll);
            res.status(401).json({ success: false, message: 'Invalid Roll Number or Password!' });
        }
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ success: false, message: 'Server error occurred.' });
    }
});

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(403).json({ message: 'No token provided' });

    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ message: 'Unauthorized access' });
        req.user = decoded;
        next();
    });
};

app.post('/api/mark-attendance', verifyToken, async (req, res) => {
    const roll = req.user.roll;
    const { courseCode } = req.body || {}; // e.g., "ch2101-lecture"

    if (!courseCode) {
        return res.status(400).json({ success: false, message: 'Course code is required.' });
    }

    // Split the unique slot code from the base column code
    // Splits the unique slot code from the base column code
    const formattedCode = courseCode.toLowerCase(); 
    const baseCode = formattedCode.split('-')[0]; // Extracts just "ch2101"
    const column = courseColumnMap[baseCode];     // Finds the real DB column

    if (!column) {
        return res.status(400).json({ success: false, message: 'Invalid course code detected.' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        try {
            // Logs the EXACT slot (e.g., ch2101-tutorial) to avoid daily duplicate collision
            await conn.query(
                'INSERT INTO attendance_log (roll, course_code, marked_date) VALUES (UPPER(?), ?, CURDATE())',
                [roll, formattedCode]
            );
        } catch (dupErr) {
            if (dupErr.code === 'ER_DUP_ENTRY') {
                await conn.rollback();
                return res.status(409).json({ success: false, message: 'Already marked today.' });
            }
            throw dupErr;
        }

        // Increments the master count using the base column (ch2101)
        const [result] = await conn.query(
            `UPDATE attendance_management SET ${column} = ${column} + 1 WHERE LOWER(roll) = LOWER(?)`,
            [roll]
        );

        if (result.affectedRows > 0) {
            await conn.commit();
            res.json({ success: true, message: 'Attendance logged successfully!' });
        } else {
            await conn.rollback();
            res.status(404).json({ success: false, message: 'User not found in attendance records.' });
        }
    } catch (error) {
        await conn.rollback();
        console.error(error);
        res.status(500).json({ success: false, message: 'Database error occurred while marking attendance.' });
    } finally {
        conn.release();
    }
});

// Calculate total held on the backend is deprecated, we will calculate this cleanly 
// on the frontend using the exact class schedule mapping. This endpoint is retained 
// for fallback safety.
app.get('/api/total-held/:courseCode', async (req, res) => {
    res.json({ success: false, message: 'Delegated to frontend calculation.' });
});

app.get('/api/attendance/:roll', verifyToken, async (req, res) => {
    if (req.user.roll.toLowerCase() !== req.params.roll.toLowerCase()) {
        return res.status(403).json({ success: false, message: 'Unauthorized lookup' });
    }

    const roll = req.params.roll;
    try {
        const [rows] = await pool.query(
            'SELECT * FROM attendance_management WHERE LOWER(roll) = LOWER(?)',
            [roll]
        );

        if (rows.length > 0) {
            res.json({ success: true, data: rows[0] });
        } else {
            res.status(404).json({ success: false, message: 'No attendance records found.' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Database error fetching attendance.' });
    }
});

app.get('/api/attendance-today/:roll', verifyToken, async (req, res) => {
    if (req.user.roll.toLowerCase() !== req.params.roll.toLowerCase()) {
        return res.status(403).json({ success: false, message: 'Unauthorized lookup' });
    }

    try {
        const [rows] = await pool.query(
            'SELECT course_code FROM attendance_log WHERE LOWER(roll) = LOWER(?) AND marked_date = CURDATE()',
            [req.params.roll]
        );
        const markedCourses = rows.map(r => r.course_code.toLowerCase());
        res.json({ success: true, markedCourses });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Database error fetching today\'s attendance.' });
    }
});

app.post('/api/journal', verifyToken, async (req, res) => {
    try {
        const userEntry = req.body.entry;
        
        if (!userEntry || typeof userEntry !== 'string' || !userEntry.trim()) {
            return res.status(400).json({ success: false, message: "Entry is empty." });
        }

        const MAX_JOURNAL_LENGTH = 2000;
        if (userEntry.length > MAX_JOURNAL_LENGTH) {
            return res.status(400).json({ success: false, message: `Entry is too long (max ${MAX_JOURNAL_LENGTH} characters).` });
        }

        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: userEntry,
            config: {
                systemInstruction: "You are a friendly, relatable peer talking to a second-year Chemical Science and Technology (CST) student at IIT Patna. Keep your responses concise (1 to 2 short sentences). Speak naturally and humanly, like a supportive batchmate. Be empathetic, encouraging, and occasionally use relatable chemistry analogies (like long lab hours, organic synthesis, fluid mechanics, or quantum). Never sound like a robotic AI or a formal mentor. Keep it casual.",
                temperature: 0.85, 
            }
        });

        res.json({ success: true, reply: response.text });

    } catch (error) {
        console.error("Gemini API Error:", error);
        res.status(500).json({ success: false, message: "Failed to generate a response." });
    }
});

app.use(express.static(path.join(__dirname, 'public')));

// --- BULLETPROOF KEEP-ALIVE ---
const https = require('https');
const RENDER_URL = 'https://cst-25-attendance-tracker.onrender.com';

setInterval(async () => {
    try {
        // 1. Tap the Aiven Database to keep it awake
        await pool.query('SELECT 1');
        console.log('✅ Database keep-alive successful');

        // 2. Tap the Render Server to keep it awake
        https.get(RENDER_URL, (res) => {
            console.log(`✅ Render keep-alive status: ${res.statusCode}`);
        });
    } catch (error) {
        console.error('Keep-alive error:', error.message);
    }
}, 10 * 60 * 1000); // Runs every 10 minutes
