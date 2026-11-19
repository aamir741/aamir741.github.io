/* Cards tilt in 3D toward the cursor with a light glare. Mouse/trackpad only; off for visitors who prefer reduced motion. */
(function () {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !matchMedia("(hover: hover)").matches) return;
  document.querySelectorAll(".card, .vcard, .post, .cert").forEach(function (el) {
    el.classList.add("tilt");
    el.addEventListener("pointermove", function (e) {
      var r = el.getBoundingClientRect(), u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
      el.style.transform = "perspective(800px) rotateX(" + (0.5 - v) * 14 + "deg) rotateY(" + (u - 0.5) * 16 + "deg) translateZ(14px)";
      el.style.setProperty("--gx", u * 100 + "%"); el.style.setProperty("--gy", v * 100 + "%");
    });
    el.addEventListener("pointerleave", function () { el.style.transform = ""; });
  });
})();
