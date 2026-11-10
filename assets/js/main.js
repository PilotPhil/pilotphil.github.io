/* ==========================================================================
   Pilot Phil — small, dependency-free interactions**
   ========================================================================== */

(function () {
  'use strict';

  var header = document.getElementById('siteHeader');
  var menuToggle = document.getElementById('menuToggle');
  var mobileNav = document.getElementById('mobileNav');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var menuOpen = false;

  /* ---------------------------------------------------------- mobile menu */
  function setMenu(open, restoreFocus) {
    menuOpen = open;
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
    mobileNav.classList.toggle('is-open', open);
    header.classList.toggle('is-open', open);
    if (!open && restoreFocus) menuToggle.focus();
  }

  if (menuToggle && mobileNav) {
    menuToggle.addEventListener('click', function () {
      setMenu(!menuOpen, false);
    });

    mobileNav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setMenu(false, false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && menuOpen) setMenu(false, true);
    });

    document.addEventListener('click', function (event) {
      if (menuOpen && !header.contains(event.target)) setMenu(false, false);
    });

    var desktop = window.matchMedia('(min-width: 881px)');
    var onDesktop = function (event) {
      if (event.matches) setMenu(false, false);
    };
    if (desktop.addEventListener) desktop.addEventListener('change', onDesktop);
    else if (desktop.addListener) desktop.addListener(onDesktop);
  }

  /* ------------------------------------------------------- header / nav */
  var navLinks = Array.prototype.slice.call(
    document.querySelectorAll('.nav a[href^="#"]')
  );
  var sections = navLinks
    .map(function (link) {
      return document.querySelector(link.getAttribute('href'));
    })
    .filter(Boolean);

  function setActiveSection() {
    if (!sections.length) return;

    var probe = window.scrollY + 160;
    var current = null;

    sections.forEach(function (section) {
      if (section.offsetTop <= probe) current = section;
    });

    if (
      window.innerHeight + window.scrollY >=
      document.documentElement.scrollHeight - 40
    ) {
      current = sections[sections.length - 1];
    }

    navLinks.forEach(function (link) {
      link.removeAttribute('aria-current');
    });

    if (current) {
      var active = navLinks.find(function (link) {
        return link.getAttribute('href') === '#' + current.id;
      });
      if (active) active.setAttribute('aria-current', 'true');
    }
  }

  var ticking = false;
  function onScroll() {
    header.classList.toggle('is-scrolled', window.scrollY > 8);

    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(function () {
        setActiveSection();
        ticking = false;
      });
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();

  /* ------------------------------------------------------------- reveal */
  var revealItems = Array.prototype.slice.call(
    document.querySelectorAll('[data-reveal]')
  );

  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    revealItems.forEach(function (item) {
      item.classList.add('will-reveal');
    });

    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -6% 0px' }
    );

    revealItems.forEach(function (item) {
      revealObserver.observe(item);
    });
  } else {
    revealItems.forEach(function (item) {
      item.classList.add('is-visible');
    });
  }

  if (reduceMotion.addEventListener) {
    reduceMotion.addEventListener('change', function (event) {
      if (event.matches) {
        revealItems.forEach(function (item) {
          item.classList.add('is-visible');
        });
      }
    });
  }

  /* ---------------------------------------------------------- copy email */
  var toast = document.getElementById('toast');
  var toastTimer = null;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 1800);
  }

  function legacyCopy(text) {
    var field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    try {
      document.execCommand('copy');
      showToast('邮箱已复制');
    } catch (error) {
      showToast('复制失败，请手动选择邮箱');
    }
    document.body.removeChild(field);
  }

  Array.prototype.forEach.call(
    document.querySelectorAll('[data-copy]'),
    function (button) {
      button.addEventListener('click', function () {
        var text = button.getAttribute('data-copy');
        if (!text) return;

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(
            function () {
              showToast('邮箱已复制');
            },
            function () {
              legacyCopy(text);
            }
          );
        } else {
          legacyCopy(text);
        }
      });
    }
  );

  /* ------------------------------------------------------------ colophon */
  Array.prototype.forEach.call(
    document.querySelectorAll('[data-year]'),
    function (node) {
      node.textContent = String(new Date().getFullYear());
    }
  );
})();
