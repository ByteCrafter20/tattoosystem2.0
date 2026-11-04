// public/js/hamburger.js
(function () {
    document.addEventListener('DOMContentLoaded', function () {
            var btn = document.getElementById('hamburgerBtn');
                    var overlay = document.getElementById('mobileMenu');
                            if (!btn || !overlay) return;

                                    function setOpen(isOpen) {
                                                btn.classList.toggle('open', isOpen);
                                                            overlay.classList.toggle('open', isOpen);
                                                                        btn.setAttribute('aria-expanded', String(isOpen));
                                                                                }

                                                                                        btn.addEventListener('click', function () {
                                                                                                    setOpen(!overlay.classList.contains('open'));
                                                                                                            });

                                                                                                                    overlay.addEventListener('click', function (e) {
                                                                                                                                if (e.target.closest('a') || e.target === overlay) setOpen(false);
                                                                                                                                        });

                                                                                                                                                document.addEventListener('keydown', function (e) {
                                                                                                                                                            if (e.key === 'Escape') setOpen(false);
                                                                                                                                                                    });

                                                                                                                                                                            window.addEventListener('resize', function () {
                                                                                                                                                                                        if (window.innerWidth > 768) setOpen(false);
                                                                                                                                                                                                });
                                                                                                                                                                                                    });
                                                                                                                                                                                                    })();