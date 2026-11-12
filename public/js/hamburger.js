// public/js/hamburger.js
(function () {
    console.log('hamburger.js loaded');

    function init() {
        var btn = document.getElementById('hamburgerBtn');
        var overlay = document.getElementById('mobileMenu');

        if (!btn || !overlay) {
            console.warn('hamburger: hindi nahanap ang #hamburgerBtn o #mobileMenu');
            return;
        }

        function setOpen(isOpen) {
            btn.classList.toggle('open', isOpen);
            overlay.classList.toggle('open', isOpen);
            document.body.classList.toggle('menu-open', isOpen);
            btn.setAttribute('aria-expanded', String(isOpen));
        }

        // Hamburger: buksan / isara
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            setOpen(!overlay.classList.contains('open'));
        });

        // Pindot sa link o sa labas ng panel (sa overlay) = isara
        overlay.addEventListener('click', function (e) {
            if (e.target.closest('a') || e.target === overlay) setOpen(false);
        });

        // Esc = isara
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') setOpen(false);
        });

        // Lumaki ang screen (desktop) = isara
        window.addEventListener('resize', function () {
            if (window.innerWidth > 768) setOpen(false);
        });
    }

    // Gumagana kahit na-load na ang page bago tumakbo ang script
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();