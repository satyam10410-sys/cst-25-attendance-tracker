const API_BASE_URL = 'https://cst-25-attendance-tracker.onrender.com';

window.addEventListener('DOMContentLoaded', async () => {
    const sessionData = sessionStorage.getItem('currentUser');
    const authToken = sessionStorage.getItem('authToken');

    if (!sessionData || !authToken) {
        window.location.href = "cst.html";
        return;
    }

    const user = JSON.parse(sessionData);
    let userAttendance = {};

    // ==================== SELECTED HS ELECTIVE ====================
    // Read what the person picked once on the login page (session-only,
    // never written to localStorage or a database). Falls back to hs2110
    // if, for some reason, nothing was stored (e.g. an older session).
    const HS_ELECTIVE_INFO = {
        "hs2110": {
            code: "HS2110",
            name: "Language, Human Mind and Indian Society",
            ltpc: "L-T-P-C: 3-0-0-3",
            image: "https://cdn-icons-png.flaticon.com/128/2942/2942076.png",
            daysLabel: "[Wed,Thu,Fri]",
            // Assumption: no specific time was given for HS2110, so it's set
            // to the same 2–3 PM slot as the other electives. Adjust the
            // "time" values below if the real timing differs.
            schedule: [
                { day: "Wednesday", time: "14:00 - 15:00", type: "Lecture" },
                { day: "Thursday", time: "14:00 - 15:00", type: "Lecture" },
                { day: "Friday", time: "14:00 - 15:00", type: "Lecture" }
            ]
        },
        "hs2111": {
            code: "HS2111",
            name: "Sociology",
            ltpc: "L-T-P-C: 3-0-0-3",
            image: "https://cdn-icons-png.flaticon.com/128/2942/2942076.png",
            daysLabel: "[Tue,Wed,Thu]",
            schedule: [
                { day: "Tuesday", time: "14:00 - 15:00", type: "Lecture" },
                { day: "Wednesday", time: "14:00 - 15:00", type: "Lecture" },
                { day: "Thursday", time: "14:00 - 15:00", type: "Lecture" }
            ]
        },
        "hs2112": {
            code: "HS2112",
            name: "Demography",
            ltpc: "L-T-P-C: 3-0-0-3",
            image: "https://cdn-icons-png.flaticon.com/128/2942/2942076.png",
            daysLabel: "[Tue,Wed,Thu]",
            schedule: [
                { day: "Tuesday", time: "14:00 - 15:00", type: "Lecture" },
                { day: "Wednesday", time: "14:00 - 15:00", type: "Lecture" },
                { day: "Thursday", time: "14:00 - 15:00", type: "Lecture" }
            ]
        }
    };

    const selectedElectiveKey = (sessionStorage.getItem('selectedHSCourse') || 'hs2110').toLowerCase();
    const electiveInfo = HS_ELECTIVE_INFO[selectedElectiveKey] || HS_ELECTIVE_INFO['hs2110'];

    // Your attendance_management table has one fixed column for this elective
    // slot: hs21pq. No matter which specific HS course (hs2110/2111/2112) the
    // person picked, every attendance request must still target that same
    // column — so this key stays constant and is what actually gets sent to
    // the backend. electiveInfo above is only used for what's shown on screen.
    const ATTENDANCE_BACKEND_KEY = 'HS21PQ';

    // ------------------------------------------------------------------
    // TOAST NOTIFICATIONS
    // ------------------------------------------------------------------
    const toastContainer = document.getElementById('toastContainer');

    function showToast(message, type = 'info', duration = 4500) {
        if (!toastContainer) { alert(message); return; }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.setAttribute('role', 'status');

        const icon = document.createElement('span');
        icon.className = 'toast-icon';
        icon.textContent = type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';

        const text = document.createElement('span');
        text.className = 'toast-message';
        text.textContent = message;

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

    let markedTodaySet = new Set();

    try {
        const response = await fetch(`${API_BASE_URL}/api/attendance/${user.roll}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.status === 401 || response.status === 403) {
            sessionStorage.removeItem('currentUser');
            sessionStorage.removeItem('authToken');
            window.location.href = "cst.html";
            return;
        }

        const result = await response.json();
        if (result.success) {
            userAttendance = {};
            for (const key in result.data) {
                if (Object.prototype.hasOwnProperty.call(result.data, key)) {
                    userAttendance[key.toLowerCase()] = result.data[key];
                }
            }
        }
    } catch (error) {
        console.error("Failed to fetch attendance records", error);
    }

    try {
        const todayResponse = await fetch(`${API_BASE_URL}/api/attendance-today/${user.roll}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const todayResult = await todayResponse.json();
        if (todayResult.success) {
            markedTodaySet = new Set(todayResult.markedCourses);
        }
    } catch (error) {
        console.error("Failed to fetch today's attendance status", error);
    }

    const hour = new Date().getHours();
    let timeGreeting = "Good evening";
    if (hour < 12) timeGreeting = "Good morning";
    else if (hour < 17) timeGreeting = "Good afternoon";

    const welcomeEl = document.getElementById('welcome-message');
    welcomeEl.textContent = '';
    welcomeEl.appendChild(document.createTextNode(`${timeGreeting}, `));
    const nameSpan = document.createElement('span');
    nameSpan.id = 'user-name-greeting';
    nameSpan.textContent = user.name;
    welcomeEl.appendChild(nameSpan);
    welcomeEl.appendChild(document.createTextNode('! Welcome to your personal space.'));

    document.getElementById('user-name').textContent = user.name;
    document.getElementById('user-name-greeting').textContent = user.name;
    document.getElementById('user-roll').textContent = user.roll;
    document.getElementById('user-email').textContent = user.email;

    // ==================== PROFILE AVATAR ====================
    const DEFAULT_AVATAR = "https://cdn-icons-png.flaticon.com/128/1144/1144760.png";
    const AVATAR_KEY = `avatar_${user.roll}`;
    const AVATAR_OUTPUT_SIZE = 200;
    const MAX_AVATAR_SOURCE_SIZE = 5 * 1024 * 1024;

    const avatarImg = document.getElementById('profile-img');
    const avatarWrap = document.getElementById('avatarWrap');
    const avatarOverlay = document.getElementById('avatarOverlay');
    const avatarFileInput = document.getElementById('avatar-file-input');
    const avatarChangeBtn = document.getElementById('avatar-change-btn');
    const avatarRemoveBtn = document.getElementById('avatar-remove-btn');

    function loadSavedAvatar() {
        try {
            const saved = localStorage.getItem(AVATAR_KEY);
            if (saved) {
                avatarImg.src = saved;
                avatarRemoveBtn.hidden = false;
                return;
            }
        } catch (error) {
            console.error("Could not read saved avatar", error);
        }
        avatarImg.src = DEFAULT_AVATAR;
        avatarRemoveBtn.hidden = true;
    }
    loadSavedAvatar();

    function openAvatarPicker() {
        avatarFileInput.click();
    }
    avatarChangeBtn.addEventListener('click', openAvatarPicker);
    avatarOverlay.addEventListener('click', openAvatarPicker);
    avatarOverlay.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openAvatarPicker();
        }
    });

    function compressImageToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = AVATAR_OUTPUT_SIZE;
                    canvas.height = AVATAR_OUTPUT_SIZE;
                    const ctx = canvas.getContext('2d');

                    const side = Math.min(img.width, img.height);
                    const sx = (img.width - side) / 2;
                    const sy = (img.height - side) / 2;
                    ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);

                    resolve(canvas.toDataURL('image/jpeg', 0.85));
                };
                img.onerror = () => reject(new Error('Could not read that image.'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Could not read that file.'));
            reader.readAsDataURL(file);
        });
    }

    avatarFileInput.addEventListener('change', async () => {
        const file = avatarFileInput.files[0];
        avatarFileInput.value = '';
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showToast('Please select an image file.', 'error');
            return;
        }
        if (file.size > MAX_AVATAR_SOURCE_SIZE) {
            showToast('Image is too large (max 5MB).', 'error');
            return;
        }

        avatarWrap.classList.add('is-uploading');
        try {
            const dataUrl = await compressImageToDataUrl(file);
            localStorage.setItem(AVATAR_KEY, dataUrl);
            avatarImg.src = dataUrl;
            avatarRemoveBtn.hidden = false;
            showToast('Profile picture updated.', 'success', 3000);
        } catch (error) {
            console.error("Avatar update failed", error);
            showToast('Could not process that image.', 'error');
        } finally {
            avatarWrap.classList.remove('is-uploading');
        }
    });

    avatarRemoveBtn.addEventListener('click', () => {
        localStorage.removeItem(AVATAR_KEY);
        avatarImg.src = DEFAULT_AVATAR;
        avatarRemoveBtn.hidden = true;
        showToast('Profile picture removed.', 'info', 3000);
    });

    // Rewrite the placeholder HSS Elective-I sidebar entry to reflect the
    // specific course the person picked at login (HS2110 / HS2111 / HS2112).
    const hsListItem = document.querySelector('.courses ul li[data-code="HS21PQ"]');
    if (hsListItem) {
        hsListItem.dataset.code = ATTENDANCE_BACKEND_KEY; // stays fixed — this is what backend requests use
        hsListItem.dataset.displayCode = electiveInfo.code; // shown to the student
        hsListItem.dataset.title = electiveInfo.name.toUpperCase();
        hsListItem.dataset.ltpc = electiveInfo.ltpc;
        if (electiveInfo.image) hsListItem.dataset.image = electiveInfo.image;

        const [nameP, codeP, daysP] = hsListItem.querySelectorAll('p');
        if (nameP) nameP.textContent = electiveInfo.name;
        if (codeP) codeP.textContent = electiveInfo.code;
        if (daysP) daysP.textContent = electiveInfo.daysLabel;
    }

    const courses = document.querySelectorAll('.courses ul li');
    const exploreText = document.getElementById('explore-state');
    const courseDetails = document.getElementById('course-details');
    const detailTitle = document.getElementById('detail-title');
    const detailLtpc = document.getElementById('detail-ltpc');
    const detailCode = document.getElementById('detail-code');
    const detailImage = document.getElementById('detail-image');

    // ==================== COURSE SCHEDULE DATA ====================
    const courseSchedule = {
        "CH2101": {
            name: "Organic Chemistry", code: "CH2101",
            schedule: [
                { day: "Tuesday", time: "16:00 - 16:55", type: "Lecture" },
                { day: "Wednesday", time: "09:00 - 09:55", type: "Tutorial" },
                { day: "Wednesday", time: "10:00 - 10:55", type: "Lecture" },
                { day: "Friday", time: "17:00 - 17:55", type: "Lecture" }
            ]
        },
        "CH2102": {
            name: "Inorganic Chemistry", code: "CH2102",
            schedule: [
                { day: "Wednesday", time: "11:00 - 11:55", type: "Lecture" },
                { day: "Thursday", time: "10:00 - 10:55", type: "Tutorial" },
                { day: "Thursday", time: "11:00 - 11:55", type: "Lecture" },
                { day: "Friday", time: "12:00 - 12:55", type: "Lecture" }
            ]
        },
        "CH2103": {
            name: "Introduction to Quantum Chemistry", code: "CH2103",
            schedule: [
                { day: "Monday", time: "17:00 - 17:55", type: "Lecture" },
                { day: "Thursday", time: "17:00 - 17:55", type: "Lecture" },
                { day: "Friday", time: "09:00 - 09:55", type: "Tutorial" },
                { day: "Friday", time: "16:00 - 16:55", type: "Lecture" }
            ]
        },
        "CH2104": {
            name: "Fluid Mechanics", code: "CH2104",
            schedule: [
                { day: "Monday", time: "16:00 - 16:55", type: "Lecture" },
                { day: "Wednesday", time: "15:00 - 16:55", type: "Lecture" },
                { day: "Friday", time: "10:00 - 11:00", type: "Lab" },
                { day: "Friday", time: "15:00 - 15:55", type: "Lecture" }
            ]
        },
        "CH2105": {
            name: "Chemical Process Calculations", code: "CH2105",
            schedule: [
                { day: "Tuesday", time: "10:00 - 10:55", type: "Lecture" },
                { day: "Wednesday", time: "17:00 - 17:55", type: "Lecture" },
                { day: "Thursday", time: "15:00 - 15:55", type: "Lecture" }
            ]
        },
    };

    // The elective slot's schedule/name changes to whatever HS course was
    // picked at login, but it's stored under the fixed ATTENDANCE_BACKEND_KEY
    // ("HS21PQ") because that's the only column your attendance_management
    // table has for this slot — this way "Mark Present" for hs2110, hs2111,
    // or hs2112 all end up writing to that same hs21pq column.
    courseSchedule[ATTENDANCE_BACKEND_KEY] = {
        name: electiveInfo.name,
        code: ATTENDANCE_BACKEND_KEY,
        schedule: electiveInfo.schedule
    };

    const courseProfessor = {
        "CH2101": "Dr. Rajendra Kumar Konidena",
        "CH2102": "Dr. Neeladri Das",
        "CH2103": "Dr. T. Rajagopala Rao",
        "CH2104": "professor_fluid",
        "CH2105": "Dr. Sujoy Kumar Samanta",
        [ATTENDANCE_BACKEND_KEY]: "professor_hss"
    };

    const semesterStartDate = new Date('2026-07-28');

    function calculateTotalClasses(code) {
        const today = new Date();
        let totalClasses = 0;
        const sched = courseSchedule[code.toUpperCase()]?.schedule || [];

        for (let d = new Date(semesterStartDate); d <= today; d.setDate(d.getDate() + 1)) {
            const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
            // Count slots mapped to exactly this day
            const slotsOnDay = sched.filter(s => s.day === dayName).length;
            totalClasses += slotsOnDay;
        }
        return totalClasses;
    }

    const toDay = document.querySelector("#today-date");
    const todayTime = document.querySelector("#today-time");
    toDay.textContent = new Date().toLocaleDateString();

    const today_day = document.getElementById("today-day");
    function getTodayName() {
        const today = new Date();
        return today.toLocaleDateString('en-US', { weekday: 'long' });
    }

    let lastMinute = -1;
    function updateClock() {
        const now = new Date();
        let hours = now.getHours();
        const period = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        if (hours === 0) hours = 12;

        const hrStr = hours.toLocaleString().padStart(2, '0');
        const minStr = now.getMinutes().toLocaleString().padStart(2, '0');
        const secStr = now.getSeconds().toLocaleString().padStart(2, '0');

        todayTime.textContent = `${hrStr} : ${minStr} : ${secStr} ${period}`;

        // Live update the class states when the minute rolls over
        if (now.getMinutes() !== lastMinute) {
            lastMinute = now.getMinutes();
            renderUpcomingClasses();
        }
    }
    updateClock();
    setInterval(updateClock, 1000);

    today_day.textContent = `(${getTodayName()})`;
    today_day.style.cssText = `
    background: linear-gradient(to right, #3A7BD5 0%, #2099B5 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
    `;

    const theme = document.querySelector("#theme");
    const sun_moon = document.querySelector("#sun-moon");
    const theme_text = document.querySelector("#theme-text");

    theme.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        sun_moon.textContent = isDark ? "🌙" : "☀️";
        theme_text.textContent = isDark ? "Switch to Light Mode" : "Switch to Dark Mode";
    });

    function renderUpcomingClasses() {
        const container = document.getElementById('upcoming-classes');
        if (!container) return;

        container.innerHTML = '';

        const now = new Date();
        const currentDayIndex = now.getDay();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        const currentTimeStr = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const todayName = days[currentDayIndex];

        let upcomingClasses = [];

        Object.values(courseSchedule).forEach(course => {
            course.schedule.forEach(slot => {
                if (slot.day === todayName) {
                    const [startTime, endTime] = slot.time.split(' - ');

                    if (endTime > currentTimeStr) {
                        const isHappeningNow = (currentTimeStr >= startTime && currentTimeStr < endTime);

                        upcomingClasses.push({
                            ...course,
                            time: slot.time,
                            exactTime: startTime,
                            isHappeningNow: isHappeningNow,
                            type: slot.type || ''
                        });
                    }
                }
            });
        });

        upcomingClasses.sort((a, b) => a.exactTime.localeCompare(b.exactTime));

        if (upcomingClasses.length === 0) {
            container.innerHTML = `<p class="no-classes-msg">No more classes scheduled for today. Enjoy your free time! 🎉</p>`;
            return;
        }

        upcomingClasses.forEach(cls => {
            const item = document.createElement('div');
            item.className = `upcoming-item ${cls.isHappeningNow ? 'active-now' : ''}`;

            const liveBadge = cls.isHappeningNow ? `<span class="live-badge">Active Now</span>` : '';
            const classTypeBadge = cls.type ? `<span style="font-size: 0.75rem; color: var(--text-mid); font-family: var(--font-mono); font-weight: 500;">(${cls.type})</span>` : '';

            item.innerHTML = `
            <div class="time-slot">${cls.time}</div>
            <div class="class-info">
                <h4>${cls.name} ${classTypeBadge} ${liveBadge}</h4>
                <small>Today • ${cls.code}</small>
            </div>
        `;
            container.appendChild(item);
        });
    }

    courses.forEach(course => {
        course.addEventListener('click', async () => {
            courses.forEach(c => c.classList.remove('active'));
            course.classList.add('active');

            const title = course.getAttribute('data-title');
            const ltpc = course.getAttribute('data-ltpc');
            const code = course.getAttribute('data-code'); // used for schedule lookup + backend requests
            const displayCode = course.getAttribute('data-display-code') || code; // shown to the student
            const imageSrc = course.getAttribute('data-image');
            const displayDays = document.getElementById("classes-in-week");
            const displayProfs = document.getElementById("professor-details");
            const daysText = course.querySelector(".days").textContent;

            displayDays.innerHTML = `<strong> Schedule: </strong> ${daysText}`;
            const profName = courseProfessor[code] || "To be announced";
            displayProfs.innerHTML = `<strong> Professor: </strong> ${profName}`;

            // Calculate precise total held using frontend schedule
            const totalHeld = calculateTotalClasses(code);

            document.getElementById('total-no-of-classes').innerHTML = `<strong>Total Classes Conducted:</strong> ${totalHeld}`;

            const activeCodeLower = code.toLowerCase();
            const attendedClasses = (activeCodeLower in userAttendance) ? Number(userAttendance[activeCodeLower]) : 0;
            let currentPercentage = 0;
            const bunkMarginText = document.getElementById('bunk-margin-text');

            if (totalHeld > 0) {
                const attended = Number(attendedClasses) || 0;
                currentPercentage = Math.round((attended / totalHeld) * 100);
                const warning = document.getElementById('warning-text');

                const safeMisses = Math.floor((attended / 0.75) - totalHeld);
                const classesNeeded = Math.ceil(3 * totalHeld - 4 * attended);

                if (currentPercentage < 50) {
                    warning.style.display = 'block';
                    warning.textContent = 'Your Attendance is critically low!';
                    bunkMarginText.innerHTML = `<span class="margin-danger">You need to attend the next <strong>${classesNeeded}</strong> classes to reach 75%.</span>`;
                } else if (currentPercentage < 75) {
                    warning.style.display = 'block';
                    warning.textContent = 'Your Attendance is less than 75%';
                    bunkMarginText.innerHTML = `<span class="margin-warn">Attend the next <strong>${classesNeeded}</strong> classes to hit 75%.</span>`;
                } else {
                    warning.style.display = 'none';
                    if (safeMisses > 0) {
                        bunkMarginText.innerHTML = `<span class="margin-safe">You can safely miss the next <strong>${safeMisses}</strong> classes.</span>`;
                    } else {
                        bunkMarginText.innerHTML = `<span class="margin-warn">On the edge! Missing the next class drops you below 75%.</span>`;
                    }
                }
                bunkMarginText.style.display = 'block';
            } else {
                currentPercentage = 100;
                document.getElementById('warning-text').style.display = 'none';
                bunkMarginText.style.display = 'none';
            }

            setAttendance(currentPercentage);

            courseDetails.style.opacity = '0';
            courseDetails.style.transform = 'translateY(8px)';

            setTimeout(() => {
                exploreText.style.display = 'none';
                courseDetails.style.display = 'block';

                detailTitle.textContent = title;
                detailLtpc.textContent = ltpc;
                detailCode.textContent = displayCode;

                if (imageSrc) {
                    detailImage.src = imageSrc;
                    detailImage.style.display = 'block';
                } else {
                    detailImage.style.display = 'none';
                }

                // Inject Multiple dynamic buttons here
                const attendanceRow = document.querySelector('.attendance-row');
                attendanceRow.innerHTML = '';

                const todayName = getTodayName();
                const sched = courseSchedule[code.toUpperCase()]?.schedule || [];
                const todaySlots = sched.filter(s => s.day === todayName);

                if (todaySlots.length === 0) {
                    const btn = document.createElement('button');
                    btn.id = 'attendance';
                    btn.classList.add("no-class-btn");
                    btn.textContent = "📅 No Class Today";
                    btn.disabled = true;

                    attendanceRow.appendChild(btn);
                } else {
                    todaySlots.forEach(slot => {
                        const uniqueCode = `${code}-${slot.type}`.toLowerCase();
                        const isMarked = markedTodaySet.has(uniqueCode);

                        const btn = document.createElement('button');
                        btn.id = 'attendance';
                        btn.style.margin = "0 8px";

                        if (isMarked) {
                            btn.textContent = `${slot.type} Marked ✓`;
                            btn.disabled = true;
                            btn.style.backgroundImage = "conic-gradient(from 0deg, #10b981, #34d399, #10b981)";
                            btn.style.cursor = "not-allowed";
                        } else {
                            btn.textContent = `Mark ${slot.type} Present`;
                            btn.dataset.uniqueCode = uniqueCode;
                            btn.dataset.baseCode = code.toLowerCase();
                            btn.style.cursor = "pointer";
                            btn.addEventListener('click', handleAttendanceClick);
                        }
                        attendanceRow.appendChild(btn);
                    });
                }

                courseDetails.style.transition = 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
                courseDetails.style.opacity = '1';
                courseDetails.style.transform = 'translateY(0)';
            }, 150);
        });
    });

    async function handleAttendanceClick(e) {
        const btn = e.target;
        const uniqueCode = btn.dataset.uniqueCode;
        const baseCode = btn.dataset.baseCode;

        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = "Marking...";

        try {
            const response = await fetch(`${API_BASE_URL}/api/mark-attendance`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ courseCode: uniqueCode })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                btn.textContent = "Present Marked ✓";
                btn.style.backgroundImage = "conic-gradient(from 0deg, #10b981, #34d399, #10b981)";
                btn.disabled = true;

                userAttendance[baseCode] = (userAttendance[baseCode] || 0) + 1;
                markedTodaySet.add(uniqueCode);

                const totalHeldAfter = calculateTotalClasses(baseCode);
                const newPercent = totalHeldAfter > 0 ? Math.round((userAttendance[baseCode] / totalHeldAfter) * 100) : 100;
                setAttendance(newPercent);
            } else {
                showToast(data.message || 'Failed to mark attendance.', 'error');
                btn.textContent = originalText;
                btn.disabled = false;
            }
        } catch (error) {
            console.error(error);
            showToast("Failed to connect to the server.", 'error');
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    function setAttendance(targetPercent) {
        const circle = document.getElementById('progress');
        const textElement = document.querySelector('.percent-text');
        const radius = 50;
        const circumference = 2 * Math.PI * radius;

        circle.style.transition = 'none';
        circle.style.strokeDasharray = circumference;
        circle.style.strokeDashoffset = circumference;
        textElement.innerText = '0%';

        circle.getBoundingClientRect();

        setTimeout(() => {
            circle.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)';
            const offset = circumference - (targetPercent / 100) * circumference;
            circle.style.strokeDashoffset = offset;

            let current = 0;
            const duration = 1200;
            const interval = 20;
            const step = targetPercent / (duration / interval);

            if (targetPercent > 0) {
                const counter = setInterval(() => {
                    current += step;
                    if (current >= targetPercent) {
                        current = targetPercent;
                        clearInterval(counter);
                    }
                    textElement.innerText = Math.round(current) + '%';
                }, interval);
            }
        }, 50);
    }

    document.getElementById('logoutBtn').addEventListener('click', () => {
        sessionStorage.removeItem('currentUser');
        sessionStorage.removeItem('authToken');
        window.location.href = "cst.html";
    });

    const menuToggleBtn = document.getElementById('menuToggleBtn');
    const sidebar = document.getElementById('sidebarCourses');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    function openMenu() {
        sidebar.classList.add('open');
        sidebarOverlay.classList.add('active');
        menuToggleBtn.setAttribute('aria-expanded', 'true');
    }

    function closeMenu() {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
        menuToggleBtn.setAttribute('aria-expanded', 'false');
    }

    menuToggleBtn.addEventListener('click', () => {
        if (sidebar.classList.contains('open')) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    sidebarOverlay.addEventListener('click', closeMenu);

    courses.forEach(course => {
        course.addEventListener('click', closeMenu);
    });

    // ==================== TO-DO TRACKER LOGIC ====================
    const todoInput = document.getElementById('todo-input');
    const todoAddBtn = document.getElementById('todo-add-btn');
    const todoList = document.getElementById('todo-list');

    const todoStorageKey = `todo_${user.roll}`;

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = String(str ?? '');
        return div.innerHTML;
    }

    function loadTodos() {
        const saved = localStorage.getItem(todoStorageKey);
        return saved ? JSON.parse(saved) : [];
    }

    function saveTodos(todos) {
        localStorage.setItem(todoStorageKey, JSON.stringify(todos));
    }

    function renderTodos() {
        const todos = loadTodos();
        todoList.innerHTML = '';

        const reminderBanner = document.getElementById('todo-daily-reminder');
        const pendingTasks = todos.filter(t => !t.completed);

        if (reminderBanner) {
            if (pendingTasks.length > 0) {
                reminderBanner.style.display = 'block';
                reminderBanner.innerHTML = `⚠️ Daily Reminder: You have <strong>${pendingTasks.length}</strong> pending task(s) waiting for you!`;
            } else {
                reminderBanner.style.display = 'none';
            }
        }

        if (todos.length === 0) {
            todoList.innerHTML = '<p class="no-classes-msg">No upcoming deadlines. You are all caught up!</p>';
            return;
        }

        const today = new Date();

        todos.forEach((todo, index) => {
            const li = document.createElement('li');
            li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
            li.dataset.index = index;

            let pendingBadge = '';
            if (!todo.completed && todo.dateAdded) {
                const addedDate = new Date(todo.dateAdded);
                const diffTime = Math.abs(today - addedDate);
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays === 0) {
                    pendingBadge = `<span style="font-size: 0.75rem; background: #e0f2fe; color: #0284c7; padding: 2px 8px; border-radius: 12px; margin-left: 10px; font-weight: 500;">Added today</span>`;
                } else {
                    pendingBadge = `<span style="font-size: 0.75rem; background: #fee2e2; color: #dc2626; padding: 2px 8px; border-radius: 12px; margin-left: 10px; font-weight: 600; box-shadow: 0 0 5px rgba(220, 38, 38, 0.3);">Pending for ${diffDays} day(s)</span>`;
                }
            }

            li.innerHTML = `<div class="pending-work">
            <div class="todo-item-left" style="display: flex; align-items: center; flex-wrap: wrap;">
                <span>${escapeHTML(todo.text)}</span>
                ${pendingBadge}
            </div>
            <div class="todo-actions">
                <button class="todo-complete">${todo.completed ? 'Undo' : 'Complete'}</button>
                <button class="todo-delete">Delete</button>
            </div>
            </div>
        `;
            todoList.appendChild(li);
        });
    }

    todoList.addEventListener('click', (e) => {
        const item = e.target.closest('.todo-item');
        if (!item) return;

        const index = parseInt(item.dataset.index, 10);
        const todos = loadTodos();

        if (e.target.closest('.todo-delete')) {
            todos.splice(index, 1);
            saveTodos(todos);
            renderTodos();
        }
        else if (e.target.closest('.todo-complete') || e.target.closest('.todo-item-left')) {
            todos[index].completed = !todos[index].completed;
            saveTodos(todos);
            renderTodos();
        }
    });

    function addTodo() {
        const text = todoInput.value.trim();
        if (text === '') return;

        const todos = loadTodos();
        todos.push({ text: text, completed: false, dateAdded: new Date().toDateString() });
        saveTodos(todos);

        todoInput.value = '';
        renderTodos();
    }

    todoAddBtn.addEventListener('click', addTodo);
    todoInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTodo();
    });

    renderTodos();

    // ==================== DAILY REFLECTION LOGIC ====================
    const journalInput = document.getElementById('journal-input');
    const journalSubmitBtn = document.getElementById('journal-submit-btn');
    const journalFeedback = document.getElementById('journal-feedback');
    const journalCharCount = document.getElementById('journal-char-count');
    const JOURNAL_MAX_LENGTH = 2000;

    function updateJournalCharCount() {
        if (!journalCharCount) return;
        const len = journalInput.value.length;
        journalCharCount.textContent = `${len} / ${JOURNAL_MAX_LENGTH}`;
        journalCharCount.classList.toggle('count-warn', len >= JOURNAL_MAX_LENGTH * 0.85 && len < JOURNAL_MAX_LENGTH);
        journalCharCount.classList.toggle('count-limit', len >= JOURNAL_MAX_LENGTH);
    }
    journalInput.addEventListener('input', updateJournalCharCount);
    updateJournalCharCount();

    // ---------------- Past Reflections history ----------------
    const journalHistoryKey = `journal_history_${user.roll}`;
    const journalHistoryToggle = document.getElementById('journal-history-toggle');
    const journalHistoryLabel = document.getElementById('journal-history-label');
    const journalHistoryList = document.getElementById('journal-history-list');
    const journalHistoryClearBtn = document.getElementById('journal-history-clear');
    const MAX_HISTORY_ENTRIES = 20;

    function loadJournalHistory() {
        try {
            const saved = localStorage.getItem(journalHistoryKey);
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    }

    function saveJournalHistory(history) {
        localStorage.setItem(journalHistoryKey, JSON.stringify(history));
    }

    function renderJournalHistory() {
        const history = loadJournalHistory();
        journalHistoryLabel.textContent = `Past Reflections (${history.length})`;
        if (journalHistoryClearBtn) journalHistoryClearBtn.hidden = history.length === 0;

        if (history.length === 0) {
            journalHistoryList.innerHTML = '<li class="journal-history-empty">No reflections shared yet.</li>';
            return;
        }

        journalHistoryList.innerHTML = '';
        [...history].reverse().forEach(item => {
            const li = document.createElement('li');
            li.className = 'journal-history-item';
            li.dataset.id = item.id;
            li.innerHTML = `
                <div class="journal-history-item-top">
                    <div class="journal-history-entry">${escapeHTML(item.entry)}</div>
                    <button type="button" class="journal-history-delete" aria-label="Delete this reflection" title="Delete this reflection">✕</button>
                </div>
                <div class="journal-history-reply">${escapeHTML(item.reply)}</div>
                <span class="journal-history-time">${escapeHTML(new Date(item.timestamp).toLocaleString())}</span>
            `;
            journalHistoryList.appendChild(li);
        });
    }

    function addJournalHistoryEntry(entry, reply) {
        const history = loadJournalHistory();
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        history.push({ id, entry, reply, timestamp: Date.now() });
        while (history.length > MAX_HISTORY_ENTRIES) history.shift();
        saveJournalHistory(history);
        renderJournalHistory();
    }

    function deleteJournalHistoryEntry(id) {
        const history = loadJournalHistory().filter(item => item.id !== id);
        saveJournalHistory(history);
        renderJournalHistory();
        showToast('Reflection deleted.', 'info', 2500);
    }

    function clearJournalHistory() {
        saveJournalHistory([]);
        renderJournalHistory();
        showToast('All past reflections cleared.', 'info', 2500);
    }

    if (journalHistoryToggle) {
        journalHistoryToggle.addEventListener('click', () => {
            const isOpen = journalHistoryToggle.getAttribute('aria-expanded') === 'true';
            journalHistoryToggle.setAttribute('aria-expanded', String(!isOpen));
            journalHistoryList.hidden = isOpen;
        });
    }

    journalHistoryList.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.journal-history-delete');
        if (!deleteBtn) return;
        const item = e.target.closest('.journal-history-item');
        if (!item) return;
        deleteJournalHistoryEntry(item.dataset.id);
    });

    if (journalHistoryClearBtn) {
        journalHistoryClearBtn.addEventListener('click', () => {
            if (confirm('Delete all of your past reflections? This cannot be undone.')) {
                clearJournalHistory();
            }
        });
    }

    renderJournalHistory();

    journalSubmitBtn.addEventListener('click', async () => {
        const text = journalInput.value.trim();

        if (text === '') return;

        if (text.length > JOURNAL_MAX_LENGTH) {
            showToast(`Entry is too long (max ${JOURNAL_MAX_LENGTH} characters).`, 'error');
            return;
        }

        journalFeedback.style.display = 'block';
        journalFeedback.style.backgroundColor = '#f3f4f6';
        journalFeedback.style.color = '#4b5563';
        journalFeedback.style.borderLeftColor = '#9ca3af';
        journalFeedback.textContent = "Thinking...";
        journalInput.value = '';
        updateJournalCharCount();

        try {
            const response = await fetch(`${API_BASE_URL}/api/journal`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ entry: text })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                journalFeedback.style.backgroundColor = '#e0f2fe';
                journalFeedback.style.color = '#0369a1';
                journalFeedback.style.borderLeftColor = '#3A7BD5';
                journalFeedback.textContent = data.reply;
                addJournalHistoryEntry(text, data.reply);
            } else {
                throw new Error("Server returned an error.");
            }
        } catch (error) {
            console.error(error);
            journalFeedback.style.backgroundColor = '#fee2e2';
            journalFeedback.style.color = '#991b1b';
            journalFeedback.style.borderLeftColor = '#ef4444';
            journalFeedback.textContent = "⚠️ Connection error. Please make sure your backend is running.";
        }

        setTimeout(() => {
            journalFeedback.style.display = 'none';
        }, 12000);
    });
});
