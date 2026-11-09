// photos.js
// Photos Gallery - lahat ng larawan galing MongoDB.
// Admin lang ang may upload at delete. Ang client ay pumipili lang ng design.

document.addEventListener('DOMContentLoaded', function () {

    var isAdmin = document.body.getAttribute('data-role') === 'admin';

    var galleryGrid = document.getElementById('galleryGrid');
    var designGrid = document.getElementById('designGrid');
    var noGallery = document.getElementById('noGallery');
    var noDesigns = document.getElementById('noDesigns');

    var uploadSection = document.getElementById('uploadSection');
    var uploadForm = document.getElementById('uploadForm');

    // ==================================================
    // LOGO - pindutin ang "Totats Skin Art Tattoo" para pumunta sa Dashboard
    // (admin -> /dashboard, client -> /clientdashboard)
    // ==================================================

    var logo = document.querySelector('.logo');

    if (logo) {
        var dashboardUrl = isAdmin ? '/dashboard' : '/clientdashboard';

        logo.setAttribute('role', 'link');
        logo.setAttribute('tabindex', '0');

        logo.addEventListener('click', function () {
            window.location.href = dashboardUrl;
        });

        logo.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                window.location.href = dashboardUrl;
            }
        });
    }

    if (!galleryGrid && !designGrid) {
        return;
    }

    // ==================================================
    // HELPERS
    // ==================================================

    function escapeHtml(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function request(url, options) {
        var opts = options || {};
        opts.credentials = 'same-origin';

        return fetch(url, opts).then(function (response) {
            if (response.status === 401) {
                window.location.href = '/login';
                return null;
            }

            return response.text().then(function (body) {
                try {
                    return JSON.parse(body);
                } catch (e) {
                    console.error('Non-JSON response from ' + url + ' (HTTP ' + response.status + '):',
                        body.slice(0, 500));
                    return {
                        success: false,
                        message: 'Server error (HTTP ' + response.status + ') on ' + url + '.'
                    };
                }
            });
        });
    }

    // ==================================================
    // RENDER
    // ==================================================

    function deleteButton(photo) {
        if (!isAdmin) {
            return '';
        }

        return '<button type="button" class="delete-btn" data-delete-id="' +
            escapeHtml(photo._id) + '">Delete</button>';
    }

    function renderGallery(photos) {
        if (!galleryGrid) {
            return;
        }

        if (noGallery) {
            noGallery.style.display = photos.length ? 'none' : 'block';
        }

        galleryGrid.innerHTML = photos.map(function (photo) {
            return '<div class="photo-card">' +
                '<div class="photo-placeholder">' +
                    '<img src="' + escapeHtml(photo.image) + '" alt="' + escapeHtml(photo.title) + '">' +
                '</div>' +
                '<div class="photo-info">' +
                    '<h3>' + escapeHtml(photo.title) + '</h3>' +
                    '<p>' + escapeHtml(photo.caption) + '</p>' +
                    deleteButton(photo) +
                '</div>' +
            '</div>';
        }).join('');
    }

    function renderDesigns(photos) {
        if (!designGrid) {
            return;
        }

        if (noDesigns) {
            noDesigns.style.display = photos.length ? 'none' : 'block';
        }

        designGrid.innerHTML = photos.map(function (photo) {
            // Ang client ay dinadala sa booking kasama ang napiling design.
            // Ang "image" ang magiging Reference Photo sa appointment modal.
            var chooseLink = isAdmin
                ? ''
                : '<a href="/clientdashboard?design=' + encodeURIComponent(photo.title) +
                      '&image=' + encodeURIComponent(photo.image) +
                      '" class="choose-btn">Choose Design</a>';

            return '<div class="design-card">' +
                '<div class="photo-placeholder">' +
                    '<img src="' + escapeHtml(photo.image) + '" alt="' + escapeHtml(photo.title) + '">' +
                '</div>' +
                '<div class="photo-info">' +
                    '<h3>' + escapeHtml(photo.title) + '</h3>' +
                    '<p>' + escapeHtml(photo.caption) + '</p>' +
                    chooseLink +
                    deleteButton(photo) +
                '</div>' +
            '</div>';
        }).join('');
    }

    // ==================================================
    // LOAD
    // ==================================================

    function load() {
        return request('/api/photos')
            .then(function (data) {
                if (!data) {
                    return;
                }

                if (!data.success) {
                    console.error(data.message);
                    return;
                }

                var photos = data.photos || [];

                renderGallery(photos.filter(function (p) { return p.category !== 'design'; }));
                renderDesigns(photos.filter(function (p) { return p.category === 'design'; }));
            })
            .catch(function (error) {
                console.error('Error loading photos:', error);
            });
    }

    // ==================================================
    // ADMIN - UPLOAD
    // ==================================================

    if (uploadSection) {
        uploadSection.style.display = isAdmin ? 'block' : 'none';
    }

    if (uploadForm && isAdmin) {
        uploadForm.addEventListener('submit', function (event) {
            event.preventDefault();

            var submitButton = uploadForm.querySelector('button[type="submit"]');

            if (submitButton) {
                submitButton.disabled = true;
            }

            fetch('/api/photos', {
                method: 'POST',
                credentials: 'same-origin',
                body: new FormData(uploadForm)
            })
                .then(function (response) { return response.json(); })
                .then(function (data) {
                    if (submitButton) {
                        submitButton.disabled = false;
                    }

                    if (!data.success) {
                        alert(data.message || 'Upload failed.');
                        return;
                    }

                    uploadForm.reset();
                    load();
                })
                .catch(function (error) {
                    console.error('Error uploading photo:', error);

                    if (submitButton) {
                        submitButton.disabled = false;
                    }

                    alert('An error occurred. Please try again.');
                });
        });
    }

    // ==================================================
    // ADMIN - DELETE
    // ==================================================

    function handleDelete(event) {
        var button = event.target.closest('[data-delete-id]');

        if (!button || !isAdmin) {
            return;
        }

        if (!confirm('Delete this photo?')) {
            return;
        }

        request('/api/photos/' + encodeURIComponent(button.getAttribute('data-delete-id')), {
            method: 'DELETE'
        })
            .then(function (data) {
                if (!data) {
                    return;
                }

                if (!data.success) {
                    alert(data.message || 'Delete failed.');
                    return;
                }

                load();
            })
            .catch(function (error) {
                console.error('Error deleting photo:', error);
                alert('An error occurred. Please try again.');
            });
    }

    if (galleryGrid) { galleryGrid.addEventListener('click', handleDelete); }
    if (designGrid) { designGrid.addEventListener('click', handleDelete); }

    // ==================================================
    // INIT
    // ==================================================

    load();
});