// photos.js
// Photos Gallery - designs galing MongoDB.
// Admin lang ang may upload at delete. Ang client ay pumipili lang ng design.

document.addEventListener('DOMContentLoaded', function () {

    var isAdmin = document.body.getAttribute('data-role') === 'admin';

    var designGrid = document.getElementById('designGrid');
    var noDesigns = document.getElementById('noDesigns');

    var uploadSection = document.getElementById('uploadSection');
    var uploadForm = document.getElementById('uploadForm');

    var MAX_RETRIES = 3;          // ilang beses ulitin ang lahat ng URL bago sumuko
    var RETRY_DELAY = 1500;       // ms, dinadagdagan bawat retry
    var STALE_AFTER = 5 * 60 * 1000; // 5 minuto: i-reload ang designs pag bumalik sa tab
    var lastLoaded = 0;

    // Lalabas kung hindi talaga ma-load ang image (SVG placeholder)
    var NO_IMAGE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">' +
        '<rect width="100%" height="100%" fill="#222"/>' +
        '<text x="50%" y="45%" fill="#888" font-family="Arial" font-size="20" ' +
        'text-anchor="middle" dominant-baseline="middle">Image not found</text>' +
        '<text x="50%" y="58%" fill="#666" font-family="Arial" font-size="14" ' +
        'text-anchor="middle" dominant-baseline="middle">Click to retry</text></svg>'
    );

    // ==================================================
    // LOGO - pindutin para pumunta sa Dashboard
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

    if (!designGrid) {
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

    // Listahan ng posibleng URL ng image, isa-isang susubukan
    function imageCandidates(photo) {
        var keys = ['image', 'imageUrl', 'imagePath', 'photo', 'path', 'url', 'filename', 'file'];
        var raw = '';

        for (var i = 0; i < keys.length; i++) {
            var value = photo[keys[i]];

            if (typeof value === 'string' && value.trim()) {
                raw = value.trim();
                break;
            }
        }

        if (!raw) {
            return [];
        }

        if (/^(data:|https?:\/\/)/i.test(raw)) {
            return [raw];
        }

        // Raw base64 na walang "data:" prefix
        if (/^(\/9j\/|iVBOR|R0lGOD|UklGR)/.test(raw)) {
            return ['data:image/jpeg;base64,' + raw];
        }

        var clean = raw.replace(/\\/g, '/').replace(/^\.?\/?public\//i, '').replace(/^\.\//, '');
        var base = clean.split('/').pop();
        var list = [];

        if (clean.indexOf('/') !== -1) {
            list.push('/' + clean.replace(/^\//, ''));
        }

        ['/uploads/', '/images/', '/uploads/photos/', '/img/'].forEach(function (folder) {
            list.push(folder + base);
        });

        return list.filter(function (url, index) {
            return list.indexOf(url) === index;
        });
    }

    function imageSrc(photo) {
        return imageCandidates(photo)[0] || NO_IMAGE;
    }

    function imgTag(photo) {
        var list = imageCandidates(photo);

        return '<img src="' + escapeHtml(list[0] || NO_IMAGE) + '" ' +
            'data-all="' + escapeHtml(list.join('|')) + '" ' +
            'data-next="' + escapeHtml(list.slice(1).join('|')) + '" ' +
            'data-retry="0" ' +
            'alt="' + escapeHtml(photo.title) + '">';
    }

    // Lagyan ng cache-buster para hindi ma-cache ang failed response
    function bust(url) {
        if (/^data:/i.test(url)) {
            return url;
        }

        return url + (url.indexOf('?') === -1 ? '?' : '&') + '_r=' + Date.now();
    }

    // Kapag nag-error ang image: susunod na URL -> retry ng buong listahan -> placeholder
    function onImgError(event) {
        var img = event.target;

        if (!img || img.tagName !== 'IMG' || img.getAttribute('data-failed') === '1') {
            return;
        }

        var rest = (img.getAttribute('data-next') || '').split('|').filter(Boolean);

        // 1) Subukan ang susunod na URL
        if (rest.length) {
            img.setAttribute('data-next', rest.slice(1).join('|'));
            img.src = rest[0];
            return;
        }

        // 2) Naubos na ang URLs. Retry mula sa simula (baka natutulog lang ang server)
        var all = (img.getAttribute('data-all') || '').split('|').filter(Boolean);
        var retries = parseInt(img.getAttribute('data-retry') || '0', 10);

        if (all.length && retries < MAX_RETRIES) {
            img.setAttribute('data-retry', String(retries + 1));
            img.setAttribute('data-next', all.slice(1).join('|'));

            setTimeout(function () {
                img.src = bust(all[0]);
            }, RETRY_DELAY * (retries + 1));

            return;
        }

        // 3) Suko na: placeholder. Pwedeng i-click para ulitin.
        img.setAttribute('data-failed', '1');
        img.style.cursor = 'pointer';
        img.src = NO_IMAGE;
    }

    designGrid.addEventListener('error', onImgError, true);

    // Click sa "Image not found" para subukan ulit
    designGrid.addEventListener('click', function (event) {
        var img = event.target;

        if (!img || img.tagName !== 'IMG' || img.getAttribute('data-failed') !== '1') {
            return;
        }

        var all = (img.getAttribute('data-all') || '').split('|').filter(Boolean);

        if (!all.length) {
            return;
        }

        img.removeAttribute('data-failed');
        img.setAttribute('data-retry', '0');
        img.setAttribute('data-next', all.slice(1).join('|'));
        img.style.cursor = '';
        img.src = bust(all[0]);
    });

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

    function renderDesigns(photos) {
        if (noDesigns) {
            noDesigns.style.display = photos.length ? 'none' : 'block';
        }

        designGrid.innerHTML = photos.map(function (photo) {
            // Ang client ay dinadala sa booking kasama ang napiling design.
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

                lastLoaded = Date.now();

                var photos = data.photos || [];

                renderDesigns(photos.filter(function (p) { return p.category === 'design'; }));
            })
            .catch(function (error) {
                console.error('Error loading photos:', error);
            });
    }

    // Kapag bumalik sa tab / nag-online ulit pagkatapos ng matagal, i-reload ang designs
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible' && Date.now() - lastLoaded > STALE_AFTER) {
            load();
        }
    });

    window.addEventListener('online', function () {
        load();
    });

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

    designGrid.addEventListener('click', function (event) {
        var button = event.target.closest('[data-delete-id]');

        if (!button || !isAdmin) {
            return;
        }

        if (!confirm('Delete this design?')) {
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
    });

    // ==================================================
    // INIT
    // ==================================================

    load();
});
