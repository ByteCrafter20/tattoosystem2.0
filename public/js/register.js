// register.js with async/await

document.addEventListener('DOMContentLoaded', function () {

    var registerForm = document.getElementById('registerForm');
    var messageBox = document.getElementById('registerMessage');
    var registerButton = document.getElementById('registerButton');
    var usernameInput = document.getElementById('username');
    var passwordInput = document.getElementById('password');

    if (!registerForm) {
        return;
    }

    function showMessage(text, type) {
        messageBox.textContent = text;
        messageBox.className = 'form-message show ' + type;
    }

    function clearMessage() {
        messageBox.textContent = '';
        messageBox.className = 'form-message';
    }

    // Mawawala ang error kapag nag-type ulit ang user
    usernameInput.addEventListener('input', clearMessage);
    passwordInput.addEventListener('input', clearMessage);

    registerForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        clearMessage();

        var username = usernameInput.value.trim();
        var password = passwordInput.value;

        // Basic validation
        if (!username || !password) {
            showMessage('Please complete all registration fields.', 'error');
            return;
        }

        if (username.length < 3) {
            showMessage('Username must be at least 3 characters.', 'error');
            return;
        }

        if (password.length < 6) {
            showMessage('Password must be at least 6 characters.', 'error');
            return;
        }

        registerButton.disabled = true;

        try {
            var response = await fetch('/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: username,
                    password: password
                })
            });

            var data = {};

            try {
                data = await response.json();
            } catch (parseError) {
                data = {};
            }

            if (data.success) {
                showMessage(data.message || 'Registration successful! Please login.', 'success');

                // Iwanang nakikita ng user ang success message bago mag-redirect
                setTimeout(function () {
                    window.location.href = data.redirectUrl || '/login';
                }, 1500);

                return;
            }

            showMessage(data.message || 'Registration failed. Please try again.', 'error');
            registerButton.disabled = false;

        } catch (error) {
            showMessage('An error occurred during registration. Please try again.', 'error');
            registerButton.disabled = false;
        }
    });
});