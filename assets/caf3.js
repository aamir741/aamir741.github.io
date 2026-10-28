/* CAF-3 DSR Exam Prep tools on mirakx.com/caf3/
   - #quiz : chapter practice. Bank embedded as <script id="bank" type="application/json">.
   - #mock : mock exam builder. Bank fetched from data-bank (MCQs + Section B questions of the live chapters).
   Students register once per device; their details and every finished attempt are posted to the Google Apps Script
   web app in data-endpoint. Scores, seen/used questions and recent mock papers are also kept in this browser. */
(function () {
  "use strict";
  var LETTERS = "ABCD", SEC_PER_Q = 90;

  // ---------------------------------------------------------------- helpers
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function clock(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + ("0" + s % 60).slice(-2); }
  function track(name, params) { if (window.gtag) window.gtag("event", name, params); }
  function load(key, dflt) { try { return JSON.parse(localStorage.getItem(key)) || dflt; } catch (e) { return dflt; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { } }
  function on(root, sel, fn) { var el = root.querySelector(sel); if (el) el.onclick = fn; }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  function pageUrl() { return location.href.split("#")[0]; }

  // Prepare a bank question for display: options shuffled so the answer position tells nothing.
  function prep(q) {
    var order = shuffle([0, 1, 2, 3]);
    return { id: q.id, q: q.q, explain: q.explain, opts: order.map(function (i) { return q.options[i]; }), answer: order.indexOf(q.answer), chosen: null };
  }

  // Score per chapter from a set of answered MCQs (ids look like "c5-012"): {5: [correct, answered]}.
  function chapterStats(qs) {
    var out = {};
    qs.forEach(function (x) {
      var ch = +(/^c(\d+)-/.exec(x.id) || [])[1];
      if (!ch) return;
      out[ch] = out[ch] || [0, 0];
      out[ch][0] += x.chosen === x.answer ? 1 : 0;
      out[ch][1] += 1;
    });
    return out;
  }

  // ---------------------------------------------------------------- student details
  var SKEY = "caf3:student", HKEY = "caf3:history", ENDPOINT = "", GCLIENT = "";
  var me = load(SKEY, null);

  // This device's own record of attempts, used by the progress page when the student is not signed in with Google.
  function remember(a) {
    var h = load(HKEY, []);
    h.unshift({ t: new Date().toISOString(), kind: a.kind, chapters: a.chapters, mode: a.mode,
      questions: a.questions, correct: a.correct, pct: a.pct, detail: a.detail || {} });
    save(HKEY, h.slice(0, 400));
  }

  function send(payload) {
    if (!me) return;
    if (payload.type === "attempt") remember(payload);
    if (!ENDPOINT) return;
    payload.student = me;
    payload.page = location.pathname;
    if (me.google && tokenValid()) payload.idToken = idToken;
    try {
      fetch(ENDPOINT, { method: "POST", mode: "no-cors", keepalive: true,
        headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
    } catch (e) { }
  }

  // POST that needs the reply (Google-verified requests); a text/plain body keeps it a simple CORS request.
  function call(payload) {
    payload.student = me;
    payload.page = location.pathname;
    return fetch(ENDPOINT, { method: "POST", body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d.status !== "ok") throw new Error(d.error || "Something went wrong. Please try again."); return d; });
  }

  // ---------------------------------------------------------------- Google sign-in
  var idToken = null, idExp = 0, gsiReady = null, onCredential = null;

  function jwtPayload(t) {
    var b = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(b + "===".slice((b.length + 3) % 4)))));
  }
  function setToken(t) {
    var p = jwtPayload(t);
    idToken = t;
    idExp = p.exp * 1000;
    try { sessionStorage.setItem("caf3:idt", t); } catch (e) { }
    return p;
  }
  function tokenValid() { return !!idToken && idExp - Date.now() > 120000; }
  try { var saved = sessionStorage.getItem("caf3:idt"); if (saved) setToken(saved); } catch (e) { }

  function gsi() {
    if (!gsiReady) gsiReady = new Promise(function (ok, fail) {
      var s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.onload = function () {
        window.google.accounts.id.initialize({ client_id: GCLIENT, auto_select: true, cancel_on_tap_outside: false,
          callback: function (r) { var p = setToken(r.credential); if (onCredential) onCredential(p); } });
        ok();
      };
      s.onerror = fail;
      document.head.appendChild(s);
    });
    return gsiReady;
  }

  // Draws Google's "Continue with Google" button into el; cb(payload) runs after a successful sign-in.
  function googleButton(el, cb) {
    if (!GCLIENT || !el) return;
    gsi().then(function () {
      onCredential = cb;
      window.google.accounts.id.renderButton(el, { theme: "filled_blue", size: "large", shape: "pill", text: "continue_with", width: 280 });
    }, function () { el.textContent = "Google sign-in could not load. Please check your connection."; });
  }

  // Resolves once there is a fresh Google token, showing a sign-in prompt in box if needed.
  function needGoogle(box, why) {
    if (tokenValid()) return Promise.resolve();
    return new Promise(function (ok) {
      box.innerHTML = '<div class="g-need"><p>' + why + '</p><div class="g-btn"></div></div>';
      googleButton(box.querySelector(".g-btn"), function (p) {
        if (!me.google) { me.google = true; me.email = p.email; save(SKEY, me); }
        box.innerHTML = "";
        ok();
      });
    });
  }

  function register(root, done, cancel) {
    var v = me || {};
    function field(name, label, type, extra) {
      return '<label class="qz-field"><span>' + label + '</span><input name="' + name + '" type="' + type + '" value="' + esc(v[name] || "") + '" required ' + (extra || "") + "></label>";
    }
    root.innerHTML = '<form class="qz-card qz-reg" novalidate>' +
      "<h3>Before you start: your details</h3>" +
      '<p class="qz-note">Free, one time on this device. Your results help us improve the questions, and we may contact you about CAF-3 DSR classes and material.</p>' +
      (GCLIENT ? '<div class="g-row"><div class="g-btn"></div><span class="g-hint">Recommended: keeps your progress across devices and unlocks AI marking of mock answer sheets.</span></div>' +
        '<div class="g-or"><span>or fill in the form</span></div>' : "") +
      '<div class="qz-fields">' + field("name", "Full name", "text", 'autocomplete="name" maxlength="80"') +
      field("email", "Email address", "email", 'autocomplete="email" maxlength="120"') +
      field("phone", "Mobile number", "tel", 'autocomplete="tel" placeholder="03001234567" maxlength="20"') +
      field("city", "City", "text", 'autocomplete="address-level2" placeholder="e.g. Lahore" maxlength="60"') +
      field("institute", "Institute / college", "text", 'placeholder="e.g. your CA tuition institute" maxlength="120"') + "</div>" +
      '<label class="qz-check"><input type="checkbox" name="consent"' + (me ? " checked" : "") + '><span>I agree that my details and practice results are stored as described in the <a href="/caf3/privacy/" target="_blank">CAF-3 DSR Exam Prep privacy notice</a>.</span></label>' +
      '<p class="qz-err" role="alert"></p><button type="submit" class="btn primary">' + (me ? "Save details" : "Continue →") + "</button>" +
      (cancel ? ' <button type="button" class="qz-link qz-cancel">Cancel</button>' : "") + "</form>";
    var form = root.querySelector("form"), google = !!(me && me.google);
    on(root, ".qz-cancel", cancel);
    // Signed in with Google: name and email come from the Google account, the student adds mobile, city and institute.
    function useGoogle(p) {
      google = true;
      if (!form.elements.name.value) form.elements.name.value = p.name || "";
      form.elements.email.value = p.email;
      form.elements.email.readOnly = true;
      var row = root.querySelector(".g-row");
      if (row) row.innerHTML = '<p class="g-ok">✔ Signed in with Google as <b>' + esc(p.email) + "</b>. Now add your mobile, city and institute.</p>";
      var or = root.querySelector(".g-or");
      if (or) or.remove();
      form.elements.phone.focus();
    }
    if (google && tokenValid()) useGoogle(jwtPayload(idToken));
    else googleButton(root.querySelector(".g-btn"), useGoogle);
    form.onsubmit = function (e) {
      e.preventDefault();
      var d = {}, err = "";
      ["name", "email", "phone", "city", "institute"].forEach(function (k) { d[k] = form.elements[k].value.trim(); });
      if (google) d.google = true;
      d.phone = d.phone.replace(/[\s-]/g, "");
      if (d.name.length < 3) err = "Please enter your full name.";
      else if (!/^\S+@\S+\.\S{2,}$/.test(d.email)) err = "Please enter a valid email address.";
      else if (!/^(03\d{9}|\+923\d{9}|\+\d{10,15})$/.test(d.phone)) err = "Please enter a valid mobile number, e.g. 03001234567.";
      else if (d.city.length < 2) err = "Please enter your city.";
      else if (d.institute.length < 2) err = "Please enter your institute or college.";
      else if (!form.elements.consent.checked) err = "Please tick the box to agree to the privacy notice.";
      if (err) { root.querySelector(".qz-err").textContent = err; return; }
      d.id = google && tokenValid() ? "G" + jwtPayload(idToken).sub
        : (me && me.id) || "S" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
      me = d;
      save(SKEY, me);
      send({ type: "register", device: navigator.userAgent });
      track("caf3_register", { page: location.pathname });
      done();
    };
  }

  function whoBar() {
    return '<p class="qz-me">Practising as <b>' + esc(me.name) + "</b> · " + esc(me.city) + (me.google ? ' · <span class="g-tag">Google</span>' : "") +
      ' <button type="button" class="qz-link qz-edit">Change details</button> · <a href="/caf3/progress/">My progress</a></p>';
  }

  // ---------------------------------------------------------------- quiz runner
  // opts: mode "learn" | "test", seconds (test time limit), onFinish(result)
  function runQuiz(root, qs, opts) {
    var st = { qs: qs, i: 0, started: Date.now(), over: false }, timer = null, learn = opts.mode === "learn";
    if (!learn) {
      timer = setInterval(function () {
        var left = opts.seconds - (Date.now() - st.started) / 1000, el = root.querySelector(".qz-timer");
        if (el) { el.textContent = "⏱ " + clock(left); el.classList.toggle("low", left < 60); }
        if (left <= 0) finish(true);
      }, 500);
    }

    function show() {
      var q = st.qs[st.i], n = st.qs.length, done = q.chosen != null;
      var answered = st.qs.filter(function (x) { return x.chosen != null; });
      var correct = answered.filter(function (x) { return x.chosen === x.answer; }).length;
      var html = '<div class="qz-card"><div class="qz-top"><span>' + (opts.label ? opts.label + " · " : "") + "Question <b>" + (st.i + 1) + "</b> of " + n + "</span>" +
        (learn ? '<span class="qz-score">Score ' + correct + "/" + answered.length + "</span>"
          : '<span class="qz-timer">⏱ ' + clock(opts.seconds - (Date.now() - st.started) / 1000) + "</span>") +
        '</div><div class="qz-bar"><i style="width:' + ((learn ? st.i + (done ? 1 : 0) : answered.length) / n * 100) + '%"></i></div>' +
        '<p class="qz-q">' + esc(q.q) + '</p><div class="qz-opts">' +
        q.opts.map(function (o, k) {
          var cls = "qz-opt";
          if (learn && done) cls += k === q.answer ? " right" : (k === q.chosen ? " wrong" : " dim");
          else if (k === q.chosen) cls += " sel";
          return '<button type="button" class="' + cls + '" data-k="' + k + '"' + (learn && done ? " disabled" : "") + "><b>" + LETTERS[k] + "</b><span>" + esc(o) + "</span></button>";
        }).join("") + "</div>";
      if (learn && done) {
        html += '<div class="qz-explain ' + (q.chosen === q.answer ? "ok" : "no") + '"><b>' + (q.chosen === q.answer ? "✔ Correct." : "✘ Not quite. The answer is " + LETTERS[q.answer] + ".") + "</b> " + esc(q.explain) + "</div>";
      }
      html += '<div class="qz-nav">';
      if (learn) {
        html += done ? '<button type="button" class="btn primary qz-next">' + (st.i === n - 1 ? "See results →" : "Next question →") + "</button>" : "";
        html += '<button type="button" class="qz-link qz-quit">End practice</button>';
      } else {
        html += '<button type="button" class="btn outline qz-prev"' + (st.i ? "" : " disabled") + ">← Previous</button>" +
          (st.i < n - 1 ? '<button type="button" class="btn primary qz-next">Next →</button>' : "") +
          '<button type="button" class="btn ' + (st.i === n - 1 ? "primary" : "outline") + ' qz-submit">Submit</button>';
      }
      html += "</div>";
      if (!learn) {
        html += '<div class="qz-palette" aria-label="Jump to question">' + st.qs.map(function (x, k) {
          return '<button type="button" data-go="' + k + '" class="' + (x.chosen != null ? "ans" : "") + (k === st.i ? " cur" : "") + '">' + (k + 1) + "</button>";
        }).join("") + "</div>";
      }
      root.innerHTML = html + "</div>";

      root.querySelectorAll(".qz-opt").forEach(function (b) { b.onclick = function () { choose(+b.dataset.k); }; });
      on(root, ".qz-next", function () { if (st.i < n - 1) { st.i++; show(); } else finish(false); });
      on(root, ".qz-prev", function () { st.i--; show(); });
      on(root, ".qz-quit", function () { finish(false); });
      on(root, ".qz-submit", function () {
        var left = n - answered.length;
        if (!left || confirm(left + " question(s) unanswered. Submit anyway?")) finish(false);
      });
      root.querySelectorAll("[data-go]").forEach(function (b) { b.onclick = function () { st.i = +b.dataset.go; show(); }; });
    }

    function choose(k) {
      if (learn && st.qs[st.i].chosen != null) return;
      st.qs[st.i].chosen = k;
      show();
    }

    function onKey(e) {
      if (st.over || /INPUT|TEXTAREA/.test(e.target.tagName) || !root.querySelector(".qz-opts")) return;
      var k = "abcd".indexOf(e.key.toLowerCase());
      if (k < 0) k = "1234".indexOf(e.key);
      if (k >= 0) choose(k);
      else if (e.key === "Enter") { var b = root.querySelector(".qz-next"); if (b) b.click(); }
    }
    document.addEventListener("keydown", onKey);

    function finish(timeUp) {
      if (st.over) return;
      st.over = true;
      clearInterval(timer);
      document.removeEventListener("keydown", onKey);
      var done = learn ? st.qs.filter(function (x) { return x.chosen != null; }) : st.qs;
      var right = done.filter(function (x) { return x.chosen === x.answer; }).length;
      opts.onFinish({ qs: done, right: right, pct: done.length ? Math.round(right / done.length * 100) : 0, secs: (Date.now() - st.started) / 1000,
        wrong: done.filter(function (x) { return x.chosen !== x.answer; }), timeUp: timeUp });
    }

    show();
    root.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scoreRing(r) {
    return '<div class="qz-ring" style="--p:' + r.pct + '"><b>' + r.pct + "%</b><small>" + r.right + " / " + r.qs.length + "</small></div>";
  }

  function band(pct) {
    return pct >= 80 ? ["great", "Excellent. You know this material well."] : pct >= 60 ? ["good", "Good work. Review the misses below and try again."]
      : pct >= 50 ? ["ok", "Borderline. Re-read the chapter summary, then retry your wrong answers."] : ["low", "Needs revision. Start with the study guide, then practise in Learn mode."];
  }

  function review(qs) {
    var wrong = qs.filter(function (x) { return x.chosen !== x.answer; }).length;
    return '<div class="qz-card qz-review"><div class="qz-rhead"><h3>Review your answers</h3>' +
      (wrong && wrong < qs.length ? '<label class="qz-check"><input type="checkbox" class="qz-wrongonly"> Wrong answers only</label>' : "") + "</div>" +
      qs.map(function (x, k) {
        var ok = x.chosen === x.answer;
        return '<div class="qz-ritem ' + (ok ? "ok" : "no") + '"><p><b>' + (k + 1) + ".</b> " + esc(x.q) + "</p>" +
          (ok ? '<p class="a ok">✔ ' + esc(x.opts[x.answer]) + "</p>"
            : '<p class="a no">✘ Your answer: ' + (x.chosen == null ? "<i>not answered</i>" : esc(x.opts[x.chosen])) + '</p><p class="a ok">✔ Correct: ' + esc(x.opts[x.answer]) + "</p>") +
          '<p class="why">' + esc(x.explain) + "</p></div>";
      }).join("") + "</div>";
  }

  function wireReview(root) {
    var only = root.querySelector(".qz-wrongonly");
    if (only) only.onchange = function () { root.querySelector(".qz-review").classList.toggle("wrongonly", only.checked); };
  }

  function shareLinks(text, mailSubject, mailBody) {
    return '<div class="qz-share"><a href="https://wa.me/?text=' + encodeURIComponent(text) + '" target="_blank" rel="noopener">Share on WhatsApp</a>' +
      '<a href="mailto:?subject=' + encodeURIComponent(mailSubject) + "&body=" + encodeURIComponent(mailBody) + '">Email me my results</a>' +
      '<button type="button" class="qz-link qz-copy">Copy link</button></div>';
  }

  function wireCopy(root) {
    on(root, ".qz-copy", function () {
      var b = root.querySelector(".qz-copy");
      (navigator.clipboard ? navigator.clipboard.writeText(pageUrl()) : Promise.reject()).then(function () { b.textContent = "Link copied ✔"; }, function () { b.textContent = pageUrl(); });
    });
  }

  // ---------------------------------------------------------------- chapter practice
  function practice(root) {
    var bank = JSON.parse(document.getElementById("bank").textContent);
    var ALL = bank.questions, CH = bank.chapter, KEY = "caf3:ch" + CH;

    function pick(n, preferNew, onlyIds) {
      var seen = load(KEY, {}).seen || [], pool = ALL;
      if (onlyIds) pool = ALL.filter(function (q) { return onlyIds.indexOf(q.id) >= 0; });
      var fresh = shuffle(pool.filter(function (q) { return seen.indexOf(q.id) < 0; }));
      var old = shuffle(pool.filter(function (q) { return seen.indexOf(q.id) >= 0; }));
      return (preferNew ? fresh.concat(old) : shuffle(pool)).slice(0, n).map(prep);
    }

    function setup(prev) {
      var cfg = prev || { count: Math.min(20, ALL.length), mode: "learn", fresh: true };
      if (!me) return register(root, function () { setup(cfg); });
      var s = load(KEY, {}), seenCount = (s.seen || []).length, total = ALL.length;
      var presets = [10, 20, 30].filter(function (n) { return n < total; }).concat([total]);
      root.innerHTML =
        '<div class="qz-card qz-setup">' + whoBar() +
        '<div class="qz-stats"><span><b>' + total + '</b> questions</span><span><b>' + seenCount + '</b> seen</span>' +
        '<span><b>' + (s.attempts || 0) + '</b> attempts</span><span><b>' + (s.best != null ? s.best + "%" : "–") + '</b> best score</span></div>' +
        '<h3>1. How many questions?</h3><div class="qz-chips">' +
        presets.map(function (n) { return '<button type="button" class="qz-chip" data-n="' + n + '">' + (n === total ? "All (" + n + ")" : n) + "</button>"; }).join("") +
        '<label class="qz-custom">Custom <input type="number" min="1" max="' + total + '" value="' + cfg.count + '" aria-label="Number of questions"></label></div>' +
        '<h3>2. Choose a mode</h3><div class="qz-modes">' +
        '<label class="qz-mode"><input type="radio" name="mode" value="learn"><span><b>Learn mode</b>See the answer and explanation after every question. Best for first reading.</span></label>' +
        '<label class="qz-mode"><input type="radio" name="mode" value="test"><span><b>Test mode</b>Timed (' + (SEC_PER_Q / 60) + " min per question), exam-style. Results and review at the end.</span></label></div>" +
        '<label class="qz-check"><input type="checkbox" name="fresh"' + (cfg.fresh ? " checked" : "") + "> Show questions I haven't seen first</label>" +
        '<button type="button" class="btn primary qz-start">Start practice →</button>' +
        (seenCount ? ' <button type="button" class="qz-link qz-reset">Reset my progress</button>' : "") + "</div>";
      var input = root.querySelector(".qz-custom input");
      function mark() { root.querySelectorAll(".qz-chip").forEach(function (c) { c.classList.toggle("on", +c.dataset.n === +input.value); }); }
      root.querySelectorAll(".qz-chip").forEach(function (c) { c.onclick = function () { input.value = c.dataset.n; mark(); }; });
      input.oninput = mark;
      mark();
      root.querySelector('input[value="' + cfg.mode + '"]').checked = true;
      on(root, ".qz-edit", function () { register(root, function () { setup(cfg); }, function () { setup(cfg); }); });
      on(root, ".qz-start", function () {
        var n = Math.max(1, Math.min(total, parseInt(input.value, 10) || 10));
        var c = { count: n, mode: root.querySelector('input[name="mode"]:checked').value, fresh: root.querySelector('input[name="fresh"]').checked };
        start(c, pick(n, c.fresh));
      });
      on(root, ".qz-reset", function () { if (confirm("Clear your saved scores and seen questions for this chapter?")) { save(KEY, {}); setup(cfg); } });
    }

    function start(cfg, qs) {
      track("caf3_practice_start", { chapter: CH, mode: cfg.mode, questions: qs.length });
      runQuiz(root, qs, { mode: cfg.mode, seconds: qs.length * SEC_PER_Q, onFinish: function (r) { results(cfg, r); } });
    }

    function results(cfg, r) {
      if (!r.qs.length) return setup(cfg);
      var s = load(KEY, {});
      s.attempts = (s.attempts || 0) + 1;
      s.best = Math.max(s.best || 0, r.pct);
      s.last = r.pct;
      s.seen = uniq((s.seen || []).concat(r.qs.map(function (x) { return x.id; })));
      save(KEY, s);
      track("caf3_practice_complete", { chapter: CH, mode: cfg.mode, questions: r.qs.length, score_pct: r.pct });
      send({ type: "attempt", kind: "Chapter practice", chapters: String(CH), mode: cfg.mode === "test" ? "Test" : "Learn",
        questions: r.qs.length, correct: r.right, pct: r.pct, seconds: Math.round(r.secs), detail: { mcq: chapterStats(r.qs) } });

      var b = band(r.pct);
      root.innerHTML = '<div class="qz-card qz-result ' + b[0] + '">' +
        (r.timeUp ? '<p class="qz-timeup">Time is up. Your test was submitted automatically.</p>' : "") +
        scoreRing(r) + "<h3>" + b[1] + "</h3>" +
        '<p class="qz-meta">' + (cfg.mode === "test" ? "Test mode" : "Learn mode") + " · Time " + clock(r.secs) + " · Best on this device " + s.best + "%</p>" +
        '<div class="qz-actions">' +
        (r.wrong.length ? '<button type="button" class="btn primary qz-retry">Retry my ' + r.wrong.length + " wrong answer" + (r.wrong.length > 1 ? "s" : "") + "</button>" : "") +
        '<button type="button" class="btn outline qz-again">New set of questions</button>' +
        '<button type="button" class="btn outline qz-settings">Change settings</button></div>' +
        shareLinks("I scored " + r.right + "/" + r.qs.length + " (" + r.pct + "%) on CAF-3 DSR Chapter " + CH + " MCQ practice. Try it free: " + pageUrl(),
          "My CAF-3 DSR Chapter " + CH + " practice result",
          "CAF-3 DSR Chapter " + CH + ": " + bank.title + "\nScore: " + r.right + "/" + r.qs.length + " (" + r.pct + "%)\nTime: " + clock(r.secs) +
          "\n\nQuestions to revise:\n" + (r.wrong.map(function (x) { return "- " + x.q; }).join("\n") || "None, all correct!") + "\n\n" + pageUrl()) +
        "</div>" + review(r.qs);
      on(root, ".qz-retry", function () { var ids = r.wrong.map(function (x) { return x.id; }); start(cfg, pick(ids.length, false, ids)); });
      on(root, ".qz-again", function () { start(cfg, pick(cfg.count, true)); });
      on(root, ".qz-settings", function () { setup(cfg); });
      wireCopy(root);
      wireReview(root);
      root.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    setup();
  }

  // ---------------------------------------------------------------- mock exam
  var MCQ_COUNT = 20, SECB_COUNT = 6, SECB_MARKS = 80, MOCK_SECONDS = MCQ_COUNT * SEC_PER_Q;

  function mock(root) {
    var DATA = null, USED = "caf3:mock:used", PAPERS = "caf3:mock:papers";
    root.innerHTML = '<div class="qz-card"><p>Loading question bank…</p></div>';
    fetch(root.dataset.bank).then(function (r) { return r.json(); }).then(function (d) { DATA = d; builder(); },
      function () { root.innerHTML = '<div class="qz-card"><p>Could not load the question bank. Please refresh the page.</p></div>'; });

    function byId(list) { var m = {}; list.forEach(function (q) { m[q.id] = q; }); return m; }

    // Spread picks across the chosen chapters, questions this student has not had before first.
    function spread(pool, chapters, n, used) {
      var per = {}, out = [];
      chapters.forEach(function (c) {
        var qs = pool.filter(function (q) { return q.ch === c; });
        per[c] = shuffle(qs.filter(function (q) { return used.indexOf(q.id) < 0; })).concat(shuffle(qs.filter(function (q) { return used.indexOf(q.id) >= 0; })));
      });
      var order = shuffle(chapters), i = 0;
      while (out.length < n && order.some(function (c) { return per[c].length; })) {
        var c = order[i++ % order.length];
        if (per[c].length) out.push(per[c].shift());
      }
      return out;
    }

    function buildPaper(chapters) {
      var used = load(USED, { mcq: [], secb: [] });
      var mcq = spread(DATA.mcq, chapters, MCQ_COUNT, used.mcq);
      // Try many Section B combinations; keep the one with the fewest repeats whose marks come closest to 80.
      var best = null;
      for (var t = 0; t < 300; t++) {
        var set = spread(DATA.secb, chapters, SECB_COUNT, used.secb);
        var marks = set.reduce(function (a, q) { return a + q.marks; }, 0);
        var repeats = set.filter(function (q) { return used.secb.indexOf(q.id) >= 0; }).length;
        var score = repeats * 100 + Math.abs(marks - SECB_MARKS);
        if (!best || score < best.score) best = { set: set, score: score };
        if (score === 0) break;
      }
      var code = "MX-" + Date.now().toString(36).slice(-4).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
      return { code: code, date: new Date().toISOString(), chapters: chapters, mcq: mcq.map(function (q) { return q.id; }),
        secb: best.set.map(function (q) { return q.id; }) };
    }

    function chapterLabel(chs) {
      return chs.length === DATA.chapters.length ? "All chapters" : "Chapter" + (chs.length > 1 ? "s " : " ") + chs.join(", ");
    }

    function builder() {
      if (!me) return register(root, builder);
      var papers = load(PAPERS, []);
      root.innerHTML = '<div class="qz-card qz-setup">' + whoBar() +
        "<h3>1. Choose chapters</h3>" +
        '<div class="qz-chips"><button type="button" class="qz-chip qz-all">Select all</button><button type="button" class="qz-chip qz-none">Clear</button></div>' +
        '<div class="mk-chapters">' + DATA.chapters.map(function (c) {
          return '<label class="qz-check mk-ch"><input type="checkbox" value="' + c.chapter + '"><span><b>Ch ' + c.chapter + "</b> " + esc(c.title) + "</span></label>";
        }).join("") + "</div>" +
        "<h3>2. Your paper</h3>" +
        '<ul class="mk-pattern"><li><b>Question 1</b> · ' + MCQ_COUNT + " MCQs, 1 mark each, taken online and timed (" + MOCK_SECONDS / 60 + " minutes)</li>" +
        "<li><b>Questions 2 to 7</b> · descriptive and scenario questions (about " + SECB_MARKS + " marks), downloaded as a PDF paper with a separate model-answer PDF</li></ul>" +
        '<p class="qz-note">Every paper is generated for you: questions are drawn at random from the chosen chapters, and questions you have already had come last.</p>' +
        '<p class="qz-err" role="alert"></p><button type="button" class="btn primary mk-go">Generate my mock paper →</button></div>' +
        (papers.length ? '<div class="qz-card"><h3 style="margin-top:0">Your recent mock papers</h3>' + papers.map(function (p, k) {
          return '<div class="mk-paper"><span><b>' + esc(p.code) + "</b> · " + new Date(p.date).toLocaleDateString() + " · " + esc(chapterLabel(p.chapters)) +
            (p.secA != null ? " · Q1 " + p.secA + "/" + MCQ_COUNT : "") + (p.secB != null ? " · Q2–7 " + p.secB : "") + "</span>" +
            '<span><button type="button" class="qz-link" data-pdf="q" data-k="' + k + '">Paper PDF</button><button type="button" class="qz-link" data-pdf="a" data-k="' + k + '">Answers PDF</button>' +
            (ENDPOINT && GCLIENT && p.secA != null && !p.ai ? '<button type="button" class="qz-link" data-grade="' + k + '">Upload answers for AI marking</button>' : "") + "</span></div>";
        }).join("") + "</div>" : "");
      var boxes = root.querySelectorAll(".mk-chapters input");
      on(root, ".qz-all", function () { boxes.forEach(function (b) { b.checked = true; }); });
      on(root, ".qz-none", function () { boxes.forEach(function (b) { b.checked = false; }); });
      on(root, ".qz-edit", function () { register(root, builder, builder); });
      on(root, ".mk-go", function () {
        var chs = [].filter.call(boxes, function (b) { return b.checked; }).map(function (b) { return +b.value; });
        if (!chs.length) { root.querySelector(".qz-err").textContent = "Tick at least one chapter."; return; }
        var paper = buildPaper(chs);
        track("caf3_mock_start", { chapters: chs.join(","), paper: paper.code });
        sectionA(paper);
      });
      root.querySelectorAll("[data-pdf]").forEach(function (b) {
        b.onclick = function () { pdf(papers[+b.dataset.k], b.dataset.pdf === "a"); };
      });
      root.querySelectorAll("[data-grade]").forEach(function (b) {
        b.onclick = function () {
          var p = papers[+b.dataset.grade];
          root.innerHTML = '<div class="qz-card mk-next"><span class="pill ok">' + esc(p.code) + "</span><h3>AI marking for Questions 2–7</h3>" +
            '<p class="qz-meta">' + esc(chapterLabel(p.chapters)) + " · Question 1: " + p.secA + "/" + MCQ_COUNT + "</p>" +
            '<div class="mk-ai"></div><button type="button" class="qz-link mk-new">← Back to the mock builder</button></div>';
          on(root, ".mk-new", builder);
          aiGrade(root.querySelector(".mk-ai"), p);
          root.scrollIntoView({ behavior: "smooth", block: "start" });
        };
      });
    }

    // ------------------------------------------------------------ AI marking of the handwritten Q2-Q7 script
    function aiGrade(box, paper) {
      if (!ENDPOINT || !GCLIENT || !box) return;
      var files = [];
      box.innerHTML = '<div class="mk-aicard"><h3>Get Questions 2–7 marked by AI <span class="pill ok">BETA</span></h3>' +
        '<p class="qz-note">When you have finished, take a clear photo of each answer page in order (or scan them into one PDF) and upload them here. ' +
        "Write only your paper code <b>" + esc(paper.code) + "</b> on the sheets, not your name. You get marks and feedback for every part, and your total out of 100. " +
        "Up to 2 papers a day.</p>" +
        '<label class="mk-drop"><input type="file" accept="image/*,application/pdf" multiple><span>📷 Add answer-sheet photos or a PDF</span></label>' +
        '<div class="mk-files"></div><p class="qz-err" role="alert"></p>' +
        '<button type="button" class="btn primary mk-grade" disabled>Mark my answers →</button><div class="mk-gwait"></div><div class="mk-gres"></div></div>';
      var input = box.querySelector("input[type=file]"), btn = box.querySelector(".mk-grade"), err = box.querySelector(".qz-err");
      var wait = box.querySelector(".mk-gwait");
      function list() {
        box.querySelector(".mk-files").innerHTML = files.map(function (f, i) {
          return '<span class="mk-file">' + (f.type === "application/pdf" ? "📄 " : "🖼 ") + (i + 1) + ". " + esc(f.name.slice(0, 28)) +
            ' <button type="button" data-rm="' + i + '" aria-label="Remove">✕</button></span>';
        }).join("");
        box.querySelectorAll("[data-rm]").forEach(function (b) { b.onclick = function () { files.splice(+b.dataset.rm, 1); list(); }; });
        btn.disabled = !files.length;
      }
      input.onchange = function () { files = files.concat([].slice.call(input.files)); input.value = ""; err.textContent = ""; list(); };
      btn.onclick = function () {
        err.textContent = "";
        if (files.length > 15) { err.textContent = "Please upload at most 15 pages."; return; }
        btn.disabled = true;
        needGoogle(wait, "Sign in with Google to use AI marking. It keeps your marked papers and progress safe across devices.").then(function () {
          wait.innerHTML = '<p class="mk-spin">Preparing your pages…</p>';
          return Promise.all(files.map(encode));
        }).then(function (enc) {
          var size = enc.reduce(function (s, f) { return s + f.data.length; }, 0);
          if (size > 26e6) throw new Error("These files are too large. Please upload fewer or smaller photos, or a smaller PDF.");
          wait.innerHTML = '<p class="mk-spin">Marking your script… this usually takes 1–2 minutes. Please keep this page open.</p>';
          track("caf3_ai_grade_start", { paper: paper.code, pages: enc.length });
          return call({ action: "grade", idToken: idToken, paper: { code: paper.code, chapters: paper.chapters, secb: paper.secb }, files: enc });
        }).then(function (d) {
          wait.innerHTML = "";
          showGrade(box, paper, d);
        }).catch(function (e) {
          wait.innerHTML = "";
          err.textContent = e.message || "Something went wrong. Please try again.";
          btn.disabled = !files.length;
        });
      };
    }

    // Photos are shrunk to at most 1800px and re-saved as JPEG; PDFs are sent as they are.
    function encode(f) {
      return new Promise(function (ok, fail) {
        if (f.type === "application/pdf") {
          if (f.size > 15e6) return fail(new Error(f.name + " is larger than 15 MB."));
          var rd = new FileReader();
          rd.onload = function () { ok({ name: f.name, type: f.type, data: String(rd.result).split(",")[1] }); };
          rd.onerror = function () { fail(new Error("Could not read " + f.name + ".")); };
          return rd.readAsDataURL(f);
        }
        var img = new Image(), url = URL.createObjectURL(f);
        img.onload = function () {
          var k = Math.min(1, 1800 / Math.max(img.width, img.height)), c = document.createElement("canvas");
          c.width = Math.round(img.width * k);
          c.height = Math.round(img.height * k);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          ok({ name: f.name, type: "image/jpeg", data: c.toDataURL("image/jpeg", 0.8).split(",")[1] });
        };
        img.onerror = function () { fail(new Error("Could not read " + f.name + ". Please upload JPG or PNG photos, or a PDF.")); };
        img.src = url;
      });
    }

    function showGrade(box, paper, d) {
      var q1 = paper.secA || 0, grand = q1 + d.total, max = MCQ_COUNT + d.max, pct = Math.round(grand / max * 100);
      var secbPct = d.max ? Math.round(d.total / d.max * 100) : 0, chap = {};
      d.questions.forEach(function (q) { chap[q.ch] = chap[q.ch] || [0, 0]; chap[q.ch][0] += q.marks; chap[q.ch][1] += q.max; });
      var ps = load(PAPERS, []);
      ps.forEach(function (p) { if (p.code === paper.code) { p.secB = d.total + "/" + d.max; p.ai = { total: d.total, max: d.max }; } });
      save(PAPERS, ps);
      remember({ kind: "Mock Q2-7 (AI graded) " + paper.code, chapters: paper.chapters.join(","), mode: "Mock",
        questions: d.max, correct: d.total, pct: secbPct, detail: { secb: chap } });
      send({ type: "attempt", kind: "Mock total (AI-graded Q2-7) " + paper.code, chapters: paper.chapters.join(","), mode: "Mock",
        questions: max, correct: grand, pct: pct, seconds: "" });
      track("caf3_ai_grade_done", { paper: paper.code, score_pct: secbPct });
      box.innerHTML = '<div class="mk-aicard mk-graded"><h3>Your AI-marked result</h3>' +
        '<div class="mk-scores"><div><b>' + d.total + " / " + d.max + "</b><small>Questions 2–7</small></div>" +
        "<div><b>" + q1 + " / " + MCQ_COUNT + "</b><small>Question 1</small></div>" +
        '<div class="tot"><b>' + grand + " / " + max + "</b><small>Mock total · " + pct + "%</small></div></div>" +
        (d.legibility === "poor" ? '<p class="qz-timeup">Parts of your script were hard to read, so some marks may be missing. Clearer photos give fairer marks.</p>' : "") +
        (d.overall ? '<p class="mk-overall">' + esc(d.overall) + "</p>" : "") +
        d.questions.map(function (q) {
          return "<details class=mk-q><summary><b>Question " + q.number + "</b> · " + esc(q.topic || "") + '<span>' + q.marks + " / " + q.max + "</span></summary>" +
            q.parts.map(function (p) {
              return '<p><b>(' + esc(p.label) + ") " + p.awarded + "/" + p.max + "</b> " + esc(p.feedback) + "</p>";
            }).join("") + "</details>";
        }).join("") +
        '<p class="qz-note">AI marking is an estimate. Check any mark you disagree with against the model-answer PDF. ' +
        (d.gradesLeft > 0 ? "You can have " + d.gradesLeft + " more paper" + (d.gradesLeft > 1 ? "s" : "") + " marked today." : "That was your last AI marking for today.") +
        ' <a href="/caf3/progress/">See your readiness score →</a></p></div>';
    }

    function sectionA(paper) {
      var M = byId(DATA.mcq);
      root.innerHTML = '<div class="qz-card mk-intro"><span class="pill ok">' + esc(paper.code) + "</span><h3>Question 1: Multiple-choice questions</h3>" +
        "<p>" + MCQ_COUNT + " MCQs from " + esc(chapterLabel(paper.chapters)) + ". You have <b>" + MOCK_SECONDS / 60 + " minutes</b>; the paper submits itself when time runs out. " +
        "After Question 1 you will download Questions 2 to 7.</p>" +
        '<button type="button" class="btn primary mk-start">Start Question 1 →</button></div>';
      on(root, ".mk-start", function () {
        runQuiz(root, paper.mcq.map(function (id) { return prep(M[id]); }), { mode: "test", seconds: MOCK_SECONDS, label: "Q1",
          onFinish: function (r) { afterA(paper, r); } });
      });
    }

    function afterA(paper, r) {
      paper.secA = r.right;
      var used = load(USED, { mcq: [], secb: [] });
      save(USED, { mcq: uniq(used.mcq.concat(paper.mcq)), secb: uniq(used.secb.concat(paper.secb)) });
      var papers = load(PAPERS, []);
      papers.unshift(paper);
      save(PAPERS, papers.slice(0, 15));
      track("caf3_mock_secA", { paper: paper.code, score_pct: r.pct });
      send({ type: "attempt", kind: "Mock Q1 (MCQs) " + paper.code, chapters: paper.chapters.join(","), mode: "Mock",
        questions: r.qs.length, correct: r.right, pct: r.pct, seconds: Math.round(r.secs), detail: { mcq: chapterStats(r.qs) } });

      var S = byId(DATA.secb), total = paper.secb.reduce(function (a, id) { return a + S[id].marks; }, 0);
      root.innerHTML = '<div class="qz-card qz-result ' + band(r.pct)[0] + '">' +
        (r.timeUp ? '<p class="qz-timeup">Time is up. Question 1 was submitted automatically.</p>' : "") +
        '<span class="pill ok">' + esc(paper.code) + "</span><h3>Question 1 result</h3>" + scoreRing(r) +
        '<p class="qz-meta">Time ' + clock(r.secs) + " · " + esc(chapterLabel(paper.chapters)) + "</p></div>" +
        '<div class="qz-card mk-next"><h3 style="margin-top:0">Now Questions 2 to 7 (' + total + " marks)</h3>" +
        "<p>Download your paper and write your answers on paper in about 2 hours 45 minutes. Then upload photos of your answer sheets " +
        "for AI marking, or open the model answers and mark yourself.</p>" +
        '<div class="qz-actions" style="justify-content:flex-start"><button type="button" class="btn primary mk-pdfq">Download Questions 2–7 (PDF)</button>' +
        '<button type="button" class="btn outline mk-pdfa">Download model answers (PDF)</button></div>' +
        '<div class="mk-ai"></div>' +
        '<details class="mk-selfwrap"><summary>Prefer to mark yourself?</summary>' +
        '<div class="mk-self"><label class="qz-field"><span>After marking: your marks for Questions 2–7 (out of ' + total + ')</span>' +
        '<input type="number" min="0" max="' + total + '" class="mk-secb"></label><button type="button" class="btn outline mk-save">Save my total</button></div>' +
        '<p class="mk-total"></p></details><button type="button" class="qz-link mk-new">Build another mock</button></div>' + review(r.qs);
      on(root, ".mk-pdfq", function () { pdf(paper, false); });
      on(root, ".mk-pdfa", function () { pdf(paper, true); });
      on(root, ".mk-new", builder);
      aiGrade(root.querySelector(".mk-ai"), paper);
      on(root, ".mk-save", function () {
        var b = Math.max(0, Math.min(total, parseInt(root.querySelector(".mk-secb").value, 10)));
        if (isNaN(b)) return;
        var grand = r.right + b, max = MCQ_COUNT + total, pct = Math.round(grand / max * 100);
        root.querySelector(".mk-total").innerHTML = "Your mock total: <b>" + grand + " / " + max + " (" + pct + "%)</b>";
        var ps = load(PAPERS, []);
        ps.forEach(function (p) { if (p.code === paper.code) p.secB = b + "/" + total; });
        save(PAPERS, ps);
        send({ type: "attempt", kind: "Mock total (self-marked Q2-7) " + paper.code, chapters: paper.chapters.join(","), mode: "Mock",
          questions: max, correct: grand, pct: pct, seconds: "" });
      });
      wireReview(root);
      root.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // ------------------------------------------------------------ PDF papers (jsPDF, loaded on first use)
    function lib(src) {
      return new Promise(function (ok, fail) { var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
    }

    function pdf(paper, answers) {
      var ready = window.jspdf && window.jspdf.jsPDF.API.autoTable ? Promise.resolve()
        : lib("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js")
          .then(function () { return lib("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"); });
      ready.then(function () { writePdf(paper, answers); track("caf3_mock_pdf", { paper: paper.code, kind: answers ? "answers" : "paper" }); },
        function () { alert("Could not create the PDF. Please check your internet connection and try again."); });
    }

    // Standard PDF fonts only cover Western characters.
    function plain(s) {
      return String(s).replace(/[→⇒]/g, "->").replace(/←/g, "<-").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/[✔✓]/g, "")
        .replace(/[✘✗]/g, "x").replace(/≠/g, "!=").replace(/×/g, "x").replace(/[^\x00-\xFF‘’“”–—•…€]/g, "");
    }

    function writePdf(paper, answers) {
      var S = byId(DATA.secb), doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
      var W = 210, H = 297, M = 18, y = M, LH = 5.2;
      var navy = [0, 42, 116], qs = paper.secb.map(function (id) { return S[id]; });
      var total = qs.reduce(function (a, q) { return a + q.marks; }, 0);

      // Faint diagonal "mirakx.com · All rights reserved", drawn once per page before its content so it sits behind the text.
      var marked = {};
      function watermark() {
        var pg = doc.internal.getCurrentPageInfo().pageNumber;
        if (marked[pg]) return;
        marked[pg] = true;
        var a = 35 * Math.PI / 180;
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.07 }));
        doc.setTextColor(0, 42, 116);
        doc.setFont("helvetica", "bold");
        [["mirakx.com", 72, 0], ["All rights reserved", 28, 16]].forEach(function (l) {
          doc.setFontSize(l[1]);
          var w = doc.getTextWidth(l[0]);
          // centre each line on the page centre along the 35° baseline, the second line shifted below the first
          var cx = W / 2 + l[2] * Math.sin(a), cy = H / 2 + l[2] * Math.cos(a);
          doc.text(l[0], cx - w / 2 * Math.cos(a), cy + w / 2 * Math.sin(a), { angle: 35 });
        });
        doc.restoreGraphicsState();
      }
      function room(h) { if (y + h > H - 16) { doc.addPage(); y = M; watermark(); } }
      function text(s, o) {
        o = o || {};
        doc.setFont("helvetica", o.bold ? "bold" : o.italic ? "italic" : "normal");
        doc.setFontSize(o.size || 10.5);
        doc.setTextColor.apply(doc, o.color || [20, 27, 51]);
        String(s).split("\n").forEach(function (para) {
          var lines = doc.splitTextToSize(plain(para), W - 2 * M - (o.indent || 0));
          lines.forEach(function (line) { room(LH); doc.text(line, M + (o.indent || 0), y); y += o.lh || LH; });
          y += o.gap != null ? o.gap : 1.6;
        });
      }

      watermark();
      // cover block
      doc.setFillColor.apply(doc, navy);
      doc.rect(0, 0, W, 34, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold"); doc.setFontSize(15);
      doc.text("CAF-3 Data, Systems and Risks: Mock Examination", M, 14);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      doc.text(answers ? "Questions 2 to 7: MODEL ANSWERS" : "Questions 2 to 7 (Question 1 MCQs are taken online)", M, 21);
      doc.text("Paper " + paper.code + "  ·  " + plain(chapterLabel(paper.chapters)) + "  ·  " + (me ? plain(me.name) : ""), M, 27);
      y = 44;
      if (!answers) {
        text("Marks: " + total + "    Suggested time: 2 hours 45 minutes (the full paper is 100 marks in 3 hours 15 minutes, including Question 1).", { bold: true });
        text("Instructions: Answer ALL questions. Read each scenario carefully, relate every point to the facts given, and show the marks you are aiming for in each part. When finished, mark yourself with the model-answer PDF.", { gap: 4 });
      } else {
        text("Use these answers to mark your own script. Award marks only for points you actually made and applied to the scenario. Equivalent valid points also earn credit.", { italic: true, gap: 4 });
      }

      qs.forEach(function (q, k) {
        room(20);
        doc.setDrawColor(18, 138, 84); doc.setLineWidth(0.6); doc.line(M, y, W - M, y); y += 7;
        text("QUESTION " + (k + 2) + "   (" + q.marks + " marks)", { bold: true, size: 12, color: navy, gap: 2 });
        if (!answers && q.scenario) text(q.scenario);
        if (!answers) (q.tables || []).forEach(function (t) {
          if (t.caption) text(t.caption, { bold: true, gap: 1 });
          doc.autoTable({ startY: y, head: [t.headers.map(plain)], body: t.rows.map(function (r) { return r.map(plain); }), margin: { left: M, right: M },
            styles: { fontSize: 9, cellPadding: 1.8 }, headStyles: { fillColor: navy }, theme: "grid", willDrawPage: watermark });
          y = doc.lastAutoTable.finalY + 5;
        });
        if (!answers) text("Required:", { bold: true, gap: 1 });
        q.parts.forEach(function (p) {
          room(12);
          text("(" + p.label + ")  " + p.text.replace(/^\s*Required:\s*/i, "") + "   (" + ("0" + p.marks).slice(-2) + " marks)", { bold: answers, indent: 0, gap: answers ? 1.5 : 2.5 });
          if (answers) text(p.answer, { indent: 6, gap: 3 });
        });
        y += 3;
      });

      var pages = doc.getNumberOfPages();
      for (var i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(110, 120, 140);
        doc.text("© " + new Date().getFullYear() + " mirakx.com · All rights reserved  ·  Muhammad Aamir  ·  Paper " + paper.code, M, H - 8);
        doc.text("Page " + i + " of " + pages, W - M, H - 8, { align: "right" });
      }
      doc.save("CAF3-DSR-Mock-" + paper.code + (answers ? "-Model-Answers" : "-Questions-2-7") + ".pdf");
    }
  }

  // ---------------------------------------------------------------- my progress & readiness
  // Syllabus areas and their exam weightage (ICAP CAF-3: Data 35-45%, Systems 30-40%, Risks 20-30%; mid-points used).
  var AREAS = [{ name: "Data", range: "35–45%", w: 0.40, chs: [1, 2, 3, 4, 5, 6] },
               { name: "Systems", range: "30–40%", w: 0.35, chs: [7, 8, 9, 10, 11, 12, 13] },
               { name: "Risks", range: "20–30%", w: 0.25, chs: [14, 15, 16, 17] }];

  // Per-chapter mastery from the newest attempts: the last ~60 MCQs and last 3 marked Section B questions per chapter.
  // A chapter only counts fully once about 20 questions have been answered, so a few lucky answers can't look "ready".
  function analyse(hist) {
    var st = {}, mcqTotal = 0, papers = 0;
    for (var c = 1; c <= 17; c++) st[c] = { mc: 0, mn: 0, sm: 0, sx: 0, sp: 0 };
    hist.forEach(function (a) {
      var d = a.detail || {}, mcq = d.mcq;
      if (!mcq && /^Chapter practice/.test(a.kind || "") && +a.chapters) { mcq = {}; mcq[+a.chapters] = [+a.correct || 0, +a.questions || 0]; }
      Object.keys(mcq || {}).forEach(function (ch) {
        var s = st[ch], v = mcq[ch];
        mcqTotal += v[1];
        if (s && s.mn < 60) { s.mc += v[0]; s.mn += v[1]; }
      });
      if (d.secb) papers++;
      Object.keys(d.secb || {}).forEach(function (ch) {
        var s = st[ch], v = d.secb[ch];
        if (s && s.sp < 3) { s.sm += v[0]; s.sx += v[1]; s.sp++; }
      });
    });
    var chapters = Object.keys(st).map(function (ch) {
      var s = st[ch], mcq = s.mn ? s.mc / s.mn : null, sb = s.sx ? s.sm / s.sx : null;
      var mastery = mcq != null && sb != null ? 0.6 * mcq + 0.4 * sb : mcq != null ? mcq : sb != null ? sb : 0;
      var conf = Math.min(1, (s.mn + s.sp * 10) / 20);
      return { ch: +ch, answered: s.mn, mcq: mcq, sb: sb, eff: mastery * conf, conf: conf };
    });
    var areas = AREAS.map(function (A) {
      var v = chapters.filter(function (c) { return A.chs.indexOf(c.ch) >= 0; });
      return { name: A.name, range: A.range, w: A.w, score: v.reduce(function (s, c) { return s + c.eff; }, 0) / v.length };
    });
    var readiness = Math.round(100 * areas.reduce(function (s, a) { return s + a.w * a.score; }, 0));
    return { chapters: chapters, areas: areas, readiness: readiness, mcqTotal: mcqTotal, papers: papers };
  }

  function progress(root) {
    var CH = JSON.parse(document.getElementById("chapters").textContent);
    var info = {};
    CH.forEach(function (c) { info[c.chapter] = c; });
    function pc(x) { return x == null ? "–" : Math.round(x * 100) + "%"; }

    function render(hist, source) {
      if (!hist.length) {
        root.innerHTML = '<div class="qz-card"><h3 style="margin-top:0">No practice recorded yet</h3><p class="qz-note">Answer some chapter MCQs or sit a mock, ' +
          "and your readiness score will appear here.</p>" + (CH[0] ? '<a class="btn primary" href="/caf3/' + CH[0].slug + '/">Start with Chapter 1 →</a>' : "") + "</div>" +
          '<div class="pg-sync"></div>';
        return sync();
      }
      var r = analyse(hist);
      var band = r.readiness >= 75 ? ["great", "Exam-ready"] : r.readiness >= 60 ? ["good", "Nearly there"]
        : r.readiness >= 40 ? ["ok", "Building up"] : ["low", "Early days"];
      var focus = r.chapters.slice().sort(function (a, b) { return a.eff - b.eff; }).slice(0, 4);
      root.innerHTML =
        '<div class="qz-card qz-result ' + band[0] + '"><div class="qz-ring" style="--p:' + r.readiness + '"><b>' + r.readiness + "</b><small>out of 100</small></div>" +
        "<h3>Exam readiness: " + band[1] + "</h3>" +
        '<p class="qz-meta">Based on ' + r.mcqTotal + " MCQs" + (r.papers ? " and " + r.papers + " AI-marked mock paper" + (r.papers > 1 ? "s" : "") : "") +
        ", weighted by the ICAP syllabus." + (r.mcqTotal < 150 ? " <b>Early estimate:</b> practise more chapters for an accurate score." : "") + "</p>" +
        '<div class="pg-areas">' + r.areas.map(function (a) {
          return '<div><span>' + a.name + " <small>(" + a.range + " of the exam)</small></span><div class=pg-bar><i style=\"width:" + Math.round(a.score * 100) + '%"></i></div><b>' +
            Math.round(a.score * 100) + "%</b></div>";
        }).join("") + "</div></div>" +
        '<div class="qz-card"><h3 style="margin-top:0">Work on these next</h3><div class="pg-focus">' + focus.map(function (c) {
          var why = !c.answered && c.sb == null ? "Not practised yet" : c.conf < 1 ? "Only " + c.answered + " MCQs answered so far"
            : c.sb != null && (c.mcq == null || c.sb < c.mcq) ? "Q2–7 written answers " + pc(c.sb) : "MCQ accuracy " + pc(c.mcq);
          return '<a href="/caf3/' + info[c.ch].slug + '/"><b>Chapter ' + c.ch + "</b> " + esc(info[c.ch].title) + "<small>" + why + "</small></a>";
        }).join("") + "</div></div>" +
        '<div class="qz-card"><h3 style="margin-top:0">By chapter</h3><table class="pg-table"><tr><th>Chapter</th><th>MCQs</th><th>MCQ score</th><th>Q2–7</th><th>Mastery</th></tr>' +
        r.chapters.map(function (c) {
          return '<tr><td><a href="/caf3/' + info[c.ch].slug + '/">' + c.ch + ". " + esc(info[c.ch].title) + "</a></td><td>" + c.answered + "</td><td>" + pc(c.mcq) +
            "</td><td>" + pc(c.sb) + '</td><td><div class="pg-bar"><i style="width:' + Math.round(c.eff * 100) + '%"></i></div></td></tr>';
        }).join("") + "</table></div>" +
        '<div class="qz-card"><h3 style="margin-top:0">Recent activity</h3>' + hist.slice(0, 12).map(function (a) {
          return '<div class="mk-paper"><span>' + (a.t ? new Date(a.t).toLocaleDateString() : "") + " · " + esc(a.kind || "") + "</span><b>" +
            (a.correct != null && a.questions ? a.correct + "/" + a.questions + " (" + a.pct + "%)" : "") + "</b></div>";
        }).join("") + "</div>" +
        '<p class="qz-note pg-src">' + (source === "google" ? "Showing results from all your devices (signed in with Google)." : "Showing results saved on this device.") + "</p>" +
        '<div class="pg-sync"></div>';
      if (source !== "google") sync();
    }

    // Signed-in students get their full history from the server (every device); otherwise this device's record is used.
    function sync() {
      var box = root.querySelector(".pg-sync");
      if (!ENDPOINT || !GCLIENT || !box || !me) return;
      needGoogle(box, "Sign in with Google to combine your results from all your devices.").then(function () {
        box.innerHTML = '<p class="mk-spin">Loading your history…</p>';
        return call({ action: "me", idToken: idToken });
      }).then(function (d) { render(d.attempts, "google"); }, function (e) { box.innerHTML = '<p class="qz-err">' + esc(e.message) + "</p>"; });
    }

    render(load(HKEY, []), "device");
  }

  // ---------------------------------------------------------------- start
  var q = document.getElementById("quiz"), m = document.getElementById("mock"), pg = document.getElementById("progress");
  var host = q || m || pg;
  ENDPOINT = host ? host.dataset.endpoint || "" : "";
  GCLIENT = host ? host.dataset.gclient || "" : "";
  if (q) practice(q);
  if (m) mock(m);
  if (pg) progress(pg);
})();
