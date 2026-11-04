// public/js/hamburger.js
(function () {
    document.addEventListener('DOMContentLoaded', function () {
        var btn = document.getElementById('hamburgerBtn');
        var overlay = document.getElementById('mobileMenu');
        if (!btn || !overlay) return;

        function setOpen(isOpen) {
            btn.classList.toggle('open', isOpen);
            overlay.classList.toggle('open', isOpen);
            document.body.classList.toggle('menu-open', isOpen); // para sa dim backdrop
            btn.setAttribute('aria-expanded', String(isOpen));
        }

        // Hamburger: buksan / isara
        btn.addEventListener('click', function () {
            setOpen(!overlay.classList.contains('open'));
        });

        // Pindot sa link sa loob ng menu = isara
        overlay.addEventListener('click', function (e) {
            if (e.target.closest('a') || e.target === overlay) setOpen(false);
        });

        // Pindot sa puting area (labas ng menu at ng hamburger) = isara
        document.addEventListener('click', function (e) {
            if (!overlay.classList.contains('open')) return;
            if (overlay.contains(e.target) || btn.contains(e.target)) return;
            setOpen(false);
        });

        // Esc = isara
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') setOpen(false);
        });

        // Lumaki ang screen (desktop) = isara
        window.addEventListener('resize', function () {
            if (window.innerWidth > 768) setOpen(false);
        });
    });
})();