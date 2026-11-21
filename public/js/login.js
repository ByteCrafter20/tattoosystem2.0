const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const loginButton = document.getElementById('loginButton');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');

function showError(message) {
    loginError.textContent = message;
    loginError.classList.add('show');
}

function clearError() {
    loginError.textContent = '';
    loginError.classList.remove('show');
}

// Mawawala ang error kapag nagsimula nang mag-type ulit ang user
usernameInput.addEventListener('input', clearError);
passwordInput.addEventListener('input', clearError);

loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    clearError();

    const username = usernameInput.value;
    const password = passwordInput.value;

    loginButton.disabled = true;

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        let data = {};

        try {
            data = await response.json();
        } catch (parseError) {
            data = {};
        }

        if (!response.ok) {
            showError(data.message || 'Login failed. Please check your credentials.');
            return;
        }

        // Redirect to the destination the server decided from the role in the DB
        window.location.href = data.redirectUrl || '/clientdashboard';

    } catch (err) {
        showError('Something went wrong. Please try again.');
    } finally {
        loginButton.disabled = false;
    }
});