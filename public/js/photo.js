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

    // Lalabas kung hindi ma-load ang image (SVG placeholder)
    var NO_IMAGE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">' +
        '<rect width="100%" height="100%" fill="#222"/>' +
        '<text x="50%" y="50%" fill="#888" font-family="Arial" font-size="20" ' +
        'text-anchor="middle" dominant-baseline="middle">Image not found</text></svg>'
    );

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

    // BINAGO: ginagawang tamang browser path ang naka-save na image
    // (hal. "public\uploads\a.jpg", "uploads/a.jpg", "a.jpg", "/uploads/a.jpg")
    function imageSrc(photo) {
        var keys = ['image', 'imageUrl', 'imagePath', 'photo', 'path', 'url', 'filename'];
        var raw = '';

        for (var i = 0; i < keys.length; i++) {
            var value = photo[keys[i]];

            if (typeof value === 'string' && value.trim()) {
                raw = value.trim();
                break;
            }
        }

        if (!raw) {
            return NO_IMAGE;
        }

        // Buong URL o base64: gamitin agad
        if (/^(data:|https?:\/\/)/i.test(raw)) {
            return raw;
        }

        // Alisin ang "public/" at ayusin ang backslash
        var clean = raw.replace(/\\/g, '/').replace(/^\.?\/?public\//i, '').replace(/^\.\//, '');

        if (clean.charAt(0) === '/') {
            return clean;
        }

        // Filename lang ang naka-save -> nasa /uploads
        if (clean.indexOf('/') === -1) {
            return '/uploads/' + clean;
        }

        return '/' + clean;
    }

    function imgTag(photo) {
        return '<img src="' + escapeHtml(imageSrc(photo)) + '" alt="' + escapeHtml(photo.title) + '" ' +
            'loading="lazy" onerror="this.onerror=null;this.src=\'' + NO_IMAGE.replace(/'/g, '%27') + '\';">';
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
                    imgTag(photo) +
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
                      '&image=' + encodeURIComponent(imageSrc(photo)) +
                      '" class="choose-btn">Choose Design</a>';

            return '<div class="design-card">' +
                '<div class="photo-placeholder">' +
                    imgTag(photo) +
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

                console.log('Photos loaded:', photos.length, photos[0]);

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