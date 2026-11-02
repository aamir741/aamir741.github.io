/* Home-page intro: particles form the mirakx.com logo -> "MUHAMMAD AAMIR" -> the portrait swings in, in 3D layers,
   and flies onto the hero photo as the page opens. Once per browser session; Skip button, Esc or a click skip it;
   visitors who prefer reduced motion never see it. Add ?intro to the URL to replay it. */
(function () {
  var root = document.documentElement, FORCE = /[?&]intro/.test(location.search);
  function done() { root.classList.remove("intro-pending", "intro-on"); }
  if (!FORCE && (sessionStorage.getItem("mxIntro") || matchMedia("(prefers-reduced-motion: reduce)").matches)) return done();
  try { sessionStorage.setItem("mxIntro", "1"); } catch (e) { }

  var box = document.createElement("div"); box.id = "intro"; box.setAttribute("aria-hidden", "true");
  box.innerHTML = '<canvas></canvas><p class="in-tag">IT Risk · AI · Learning</p><button type="button" class="in-skip">Skip intro</button>';
  document.body.appendChild(box); root.classList.add("intro-on"); root.classList.remove("intro-pending");
  var cv = box.querySelector("canvas"), x = cv.getContext("2d"), dpr = Math.min(devicePixelRatio || 1, 2), W, H, U;
  function size() { W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; x.setTransform(dpr, 0, 0, dpr, 0, 0); U = Math.min(W * 0.42, H * 0.55); }
  size(); addEventListener("resize", size);

  var N = W < 700 ? 2200 : 4200, P = [];
  for (var i = 0; i < N; i++) {
    var r = 2.2 + Math.random() * 2, th = Math.random() * 6.283, ph = Math.acos(2 * Math.random() - 1);
    P.push({ p: [r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph)], t: [0, 0, 0], c: [156, 210, 12], tc: [156, 210, 12], a: 1, ta: 1 });
  }

  // targets [x, y, z, r, g, b] in units (1 unit = U px), sampled from an image or text drawn off-screen
  function sample(draw, w, h, step, pick) {
    var o = document.createElement("canvas"); o.width = w; o.height = h;
    var g = o.getContext("2d"); draw(g, w, h);
    var d = g.getImageData(0, 0, w, h).data, out = [], s = 2 / Math.max(w, h * 1.6);
    for (var y = 0; y < h; y += step) for (var X = 0; X < w; X += step) {
      var k = (y * w + X) * 4, v = pick(d[k], d[k + 1], d[k + 2], d[k + 3]);
      if (v) out.push([(X - w / 2) * s, (y - h / 2) * s, 0, v[0], v[1], v[2]]);
    }
    return out;
  }
  function assign(T, jitter) {
    for (var i = T.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), q = T[i]; T[i] = T[j]; T[j] = q; }
    P.forEach(function (n, i) {
      var q = T[i % T.length];
      n.t = [q[0] + (Math.random() - 0.5) * jitter, q[1] + (Math.random() - 0.5) * jitter, q[2] + (Math.random() - 0.5) * jitter * 2];
      n.tc = [q[3], q[4], q[5]]; n.ta = i < T.length * 1.6 ? 1 : 0.25;
    });
  }
  function burst() { P.forEach(function (n) { var k = 3 + Math.random() * 3; n.t = [n.p[0] * k, n.p[1] * k, 2 + Math.random() * 3]; n.ta = 0; }); }

  var logo = new Image(), T_LOGO, T_NAME, t0, phase = 0;
  logo.onload = function () { (document.fonts ? document.fonts.ready : Promise.resolve()).then(go); };
  logo.onerror = finish;
  logo.src = "/assets/mirakx-logo.png";
  setTimeout(function () { if (!t0) finish(); }, 4000);   // slow connection: open the page rather than wait

  function go() {
    if (!box.isConnected) return;
    T_LOGO = sample(function (g, w, h) { g.drawImage(logo, 0, 0, w, h); }, 640, 110, 2, function (r, g, b, a) {
      if (a < 128 || r + g + b > 690) return null;                     // skip the white background
      return g > b && g > r ? [156, 210, 12] : [236, 242, 252];         // green stays lime, navy becomes light
    });
    T_NAME = sample(function (g, w, h) {
      g.font = "800 92px Poppins, Arial Black, sans-serif"; g.textBaseline = "middle";
      var a = "MUHAMMAD ", b = "AAMIR", wa = g.measureText(a).width, wb = g.measureText(b).width, s = (w - wa - wb) / 2;
      g.fillStyle = "#fff"; g.fillText(a, s, h / 2); g.fillStyle = "#9CD20C"; g.fillText(b, s + wa, h / 2);
    }, 1000, 130, 3, function (r, g, b, a) { return a > 128 ? [r, g, b] : null; });
    assign(T_LOGO, 0.006); t0 = performance.now(); requestAnimationFrame(frame);
    setTimeout(finish, 9200);   // ends on time even if the browser throttles animation frames
  }

  var mx = 0, my = 0, last = 0;
  addEventListener("pointermove", function (e) { mx = e.clientX / W - 0.5; my = e.clientY / H - 0.5; });
  function frame() {
    if (!box.isConnected) return;
    var now = performance.now(), t = now - t0, dt = Math.min(50, now - (last || now)); last = now;
    // timeline (ms): 0 logo · 2600 name · 5000 portrait · 8800 page
    if (phase === 0 && t > 2600) { phase = 1; assign(T_NAME, 0.004); box.classList.add("show-tag"); }
    if (phase === 1 && t > 5000) { phase = 2; box.classList.remove("show-tag"); burst(); showPortrait(); }
    if (t > 8800) return finish();

    var k = 1 - Math.pow(0.925, dt / 16.7), ka = 1 - Math.pow(0.95, dt / 16.7);
    var a = Math.sin(t * 0.0007) * 0.3 + mx * 0.5, b = my * 0.35, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    x.clearRect(0, 0, W, H);
    for (var i = 0; i < N; i++) {
      var n = P[i];
      for (var j = 0; j < 3; j++) { n.p[j] += (n.t[j] - n.p[j]) * k; n.c[j] += (n.tc[j] - n.c[j]) * ka; }
      n.a += (n.ta - n.a) * ka;
      if (n.a < 0.03) continue;
      var x1 = n.p[0] * ca + n.p[2] * sa, z1 = -n.p[0] * sa + n.p[2] * ca, y2 = n.p[1] * cb - z1 * sb, z2 = n.p[1] * sb + z1 * cb;
      var f = 3.2 / (3.2 - z2); if (f <= 0) continue;
      var s = (W < 700 ? 1.6 : 1.9) * f;
      x.fillStyle = "rgba(" + (n.c[0] | 0) + "," + (n.c[1] | 0) + "," + (n.c[2] | 0) + "," + (n.a * Math.min(1, 0.75 + z2)).toFixed(2) + ")";
      x.fillRect(W / 2 + x1 * U * f, H / 2 + y2 * U * f, s, s);
    }
    requestAnimationFrame(frame);
  }

  function showPortrait() {
    var d = document.createElement("div"); d.className = "in-photo depth";
    d.innerHTML = '<div class="in-glow"></div><img src="/assets/aamir.jpg" alt=""><div class="in-ring"></div>';
    box.appendChild(d);
  }

  function finish() {
    if (!box.isConnected || box.classList.contains("out")) return done();
    var ph = box.querySelector(".in-photo"), hero = document.querySelector("header .photo img");
    if (ph && hero) {   // fly the portrait onto the hero photo
      ph.style.animation = "none";
      var a = ph.getBoundingClientRect(), b = hero.getBoundingClientRect();
      ph.style.transition = "transform .8s cubic-bezier(.6,0,.2,1)";
      ph.style.transform = "translate(" + (b.left + b.width / 2 - a.left - a.width / 2) + "px," + (b.top + b.height / 2 - a.top - a.height / 2) + "px) scale(" + b.width / a.width + ")";
    }
    box.classList.add("out"); done();
    setTimeout(function () { box.remove(); }, 900);
  }
  box.querySelector(".in-skip").addEventListener("click", function (e) { e.stopPropagation(); finish(); });
  box.addEventListener("click", finish);
  addEventListener("keydown", function (e) { if (e.key === "Escape") finish(); });
})();
