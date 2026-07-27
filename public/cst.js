// Single place to change the backend URL (e.g. to an https:// address in production)
const API_BASE_URL = 'http://localhost:3000';

const loginForm = document.getElementById('loginForm');
const rollInput = document.getElementById('roll');
const passwordInput = document.getElementById('password');
const tcCheckbox = document.getElementById('tc');
const rememberCheckbox = document.getElementById('me');
const loginBtn = document.getElementById('loginBtn');
const loginBtnText = document.getElementById('loginBtnText');
const togglePasswordBtn = document.getElementById('togglePassword');
const toastContainer = document.getElementById('toastContainer');

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
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!tcCheckbox.checked) {
        showToast("Please agree to the Terms and Conditions to proceed.", 'error');
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
            } else {
                localStorage.removeItem('rememberedRoll');
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