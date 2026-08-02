const API_BASE_URL = 'https://cst-25-attendance-tracker.onrender.com';

const loginForm = document.getElementById('loginForm');
const rollInput = document.getElementById('roll');
const passwordInput = document.getElementById('password');
const tcCheckbox = document.getElementById('tc');
const rememberCheckbox = document.getElementById('me');
const loginBtn = document.getElementById('loginBtn');
const loginBtnText = document.getElementById('loginBtnText');
const togglePasswordBtn = document.getElementById('togglePassword');
const toastContainer = document.getElementById('toastContainer');
const electiveSelect = document.getElementById('hsElective');
const electiveLockedNote = document.getElementById('electiveLockedNote');

// Session-only keys — deliberately sessionStorage (NOT localStorage, no backend
// call either) so the elective choice is remembered only for this browser tab
// session. Closing the tab/browser clears it and the person can pick again.
const HS_ELECTIVE_KEY = 'selectedHSCourse';
const HS_ELECTIVE_LOCK_KEY = 'hsCourseLocked';

// "Remember me" now means a real stay-signed-in session on this device: the
// auth TOKEN (never the password) is kept in localStorage so it survives
// closing the browser. It's cleared on explicit logout or if the token turns
// out to be expired/invalid (see user.js).
const REMEMBERED_TOKEN_KEY = 'rememberedAuthToken';
const REMEMBERED_USER_KEY = 'rememberedUser';

// ------------------------------------------------------------------
// TOAST NOTIFICATIONS
// Small glass-panel messages instead of blocking alert() popups.
// ------------------------------------------------------------------
function showToast(message, type = 'info', duration = 4500) {
    if (!toastContainer) { alert(message); return; } // fallback safety net

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'status');

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.textContent = type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';

    const text = document.createElement('span');
    text.className = 'toast-message';
    text.textContent = message; // textContent only — never innerHTML

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', 'Dismiss notification');
    closeBtn.textContent = '×';

    toast.append(icon, text, closeBtn);
    toastContainer.appendChild(toast);

    const remove = () => {
        toast.classList.add('is-leaving');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    };

    closeBtn.addEventListener('click', remove);
    setTimeout(remove, duration);
}

// ------------------------------------------------------------------
// PASSWORD VISIBILITY TOGGLE
// ------------------------------------------------------------------
if (togglePasswordBtn && passwordInput) {
    const eyeOpen = togglePasswordBtn.querySelector('.eye-open');
    const eyeClosed = togglePasswordBtn.querySelector('.eye-closed');

    togglePasswordBtn.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        togglePasswordBtn.setAttribute('aria-pressed', String(isPassword));
        togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
        eyeOpen.style.display = isPassword ? 'none' : 'block';
        eyeClosed.style.display = isPassword ? 'block' : 'none';
    });
}

function setLoginLoading(isLoading) {
    loginBtn.classList.toggle('is-loading', isLoading);
    loginBtn.disabled = isLoading;
    loginBtnText.textContent = isLoading ? 'Logging in…' : 'Log In';
}

window.addEventListener('DOMContentLoaded', () => {
    const savedRoll = localStorage.getItem('rememberedRoll');
    if (savedRoll) {
        rollInput.value = savedRoll;
        rememberCheckbox.checked = true;
    }

    // If this tab already locked in an elective earlier this session, restore
    // and disable the dropdown so it can't be changed a second time.
    const lockedElective = sessionStorage.getItem(HS_ELECTIVE_KEY);
    const isElectiveLocked = sessionStorage.getItem(HS_ELECTIVE_LOCK_KEY) === 'true';
    if (electiveSelect && lockedElective && isElectiveLocked) {
        electiveSelect.value = lockedElective;
        electiveSelect.disabled = true;
        if (electiveLockedNote) electiveLockedNote.hidden = false;
    }

    // Stay-signed-in: if a remembered token exists on this device, skip the
    // form entirely and go straight to the dashboard. If the token has
    // expired, user.js will bounce back here and clear it — no loop, since
    // that clears these same keys first.
    const rememberedToken = localStorage.getItem(REMEMBERED_TOKEN_KEY);
    const rememberedUser = localStorage.getItem(REMEMBERED_USER_KEY);
    if (rememberedToken && rememberedUser) {
        sessionStorage.setItem('authToken', rememberedToken);
        sessionStorage.setItem('currentUser', rememberedUser);
        setLoginLoading(true);
        showToast('Welcome back — signing you in…', 'success', 1200);
        window.location.href = "user.html";
    }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!tcCheckbox.checked) {
        showToast("Please agree to the Terms and Conditions to proceed.", 'error');
        return;
    }

    const selectedElective = electiveSelect ? electiveSelect.value : '';
    if (!selectedElective) {
        showToast("Please select your HS elective to continue.", 'error');
        return;
    }

    const roll = rollInput.value.trim();
    const password = passwordInput.value;

    setLoginLoading(true);

    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roll, password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            sessionStorage.setItem('currentUser', JSON.stringify(data.user));
            sessionStorage.setItem('authToken', data.token);

            if (rememberCheckbox.checked) {
                localStorage.setItem('rememberedRoll', roll);
                localStorage.setItem(REMEMBERED_TOKEN_KEY, data.token);
                localStorage.setItem(REMEMBERED_USER_KEY, JSON.stringify(data.user));
            } else {
                localStorage.removeItem('rememberedRoll');
                localStorage.removeItem(REMEMBERED_TOKEN_KEY);
                localStorage.removeItem(REMEMBERED_USER_KEY);
            }

            // Lock the elective choice in for this session only, the first time.
            // Not written to localStorage or any database — sessionStorage clears
            // itself when the tab/browser closes, so nothing lingers permanently.
            if (sessionStorage.getItem(HS_ELECTIVE_LOCK_KEY) !== 'true') {
                sessionStorage.setItem(HS_ELECTIVE_KEY, selectedElective);
                sessionStorage.setItem(HS_ELECTIVE_LOCK_KEY, 'true');
            }

            showToast('Login successful — redirecting…', 'success', 1500);
            window.location.href = "user.html"; 
        } 
        else {
            showToast(data.message || "Wrong Roll No. or Password", 'error');
            setLoginLoading(false);
        }
    } catch (error) {
        console.error("Network Error:", error);
        showToast("Cannot connect to server backend system.", 'error');
        setLoginLoading(false);
    }
});