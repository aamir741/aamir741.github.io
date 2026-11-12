/* mirakx.com admin panel: owner + helpers sign in with Google. Reads Firestore directly (security rules allow staff only);
   every change goes through a Cloud Function (setAccess, reviewMarks, createAssignment, closeAssignment, setAdmin). */
(function () {
  "use strict";
  var CONFIG = { apiKey: "AIzaSyAA-ddrw3baU8EGPIZgSay0gOFqQi1ScOs", authDomain: "mirakx-35901.firebaseapp.com", projectId: "mirakx-35901",
    storageBucket: "mirakx-35901.firebasestorage.app", messagingSenderId: "513880017632", appId: "1:513880017632:web:42705981297f201b26de85" };
  var OWNERS = ["aamir741@gmail.com"];   // keep in step with firebase/functions/config.js
  var SUBJECTS = {
    "icap-caf3-dsr": { name: "ICAP CAF-3 Data, Systems & Risks", chapters: [
      [1, "Types of Data & Sources"], [2, "Data Governance & Management"], [3, "Introduction to Data Analytics"], [4, "Big Data"],
      [5, "Database Management Systems"], [6, "Database Normalization & Data Warehousing"], [7, "Information Systems Architecture"],
      [8, "Enterprise Resource Planning (ERP) Systems"], [9, "Emerging Technologies"], [10, "Artificial Intelligence & Automation"],
      [11, "Cloud Computing"], [12, "Blockchain and Fintech"], [13, "Impact of Digital Disruption on Business & Accountancy"],
      [14, "IT Risk Management and Security"], [15, "Cybersecurity and Information Security Risks"], [16, "IT General Controls for Managing Risk"],
      [17, "ICT's Role in Risk Management"]] }
  };

  firebase.initializeApp(CONFIG);
  var auth = firebase.auth(), db = firebase.firestore(), fns = firebase.app().functions("asia-south1");
  var app = document.getElementById("app"), me = null, role = null, subject = Object.keys(SUBJECTS)[0];
  var D = null;   // loaded data for the current subject

  // ---------------------------------------------------------------- helpers
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function ts(v) { if (!v) return null; if (v.toDate) return v.toDate(); if (typeof v === "number") return new Date(v); return new Date(v); }
  function fmt(v) { var d = ts(v); return d && !isNaN(d) ? d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"; }
  function day(v) { var d = ts(v); return d ? d.toISOString().slice(0, 10) : ""; }
  function call(name, data) {
    return fns.httpsCallable(name)(data).then(function (r) { return r.data; }, function (e) { throw new Error(e.message || "Failed"); });
  }
  function pill(a) { return '<span class="pill ' + esc(a) + '">' + esc(a || "free") + "</span>"; }
  function csv(rows, name) {
    var text = rows.map(function (r) { return r.map(function (c) { c = String(c == null ? "" : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(","); }).join("\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv" }));
    a.download = name;
    a.click();
  }

  // ---------------------------------------------------------------- sign-in and role
  function signInScreen(msg) {
    document.getElementById("tabs").hidden = true;
    app.innerHTML = '<div class="card" style="max-width:460px;margin:60px auto;text-align:center"><h2>Admin sign-in</h2>' +
      '<p class="muted">Sign in with the Google account that has admin access.</p>' + (msg ? '<p class="err">' + esc(msg) + "</p>" : "") +
      '<p style="margin-top:18px"><button class="btn primary" id="gin">Continue with Google</button></p></div>';
    $("#gin").onclick = function () {
      var p = new firebase.auth.GoogleAuthProvider();
      p.setCustomParameters({ prompt: "select_account" });
      auth.signInWithPopup(p).catch(function (e) { if (e.code !== "auth/popup-closed-by-user") signInScreen(e.message); });
    };
  }

  auth.onAuthStateChanged(function (u) {
    if (!u) return signInScreen();
    me = u.email.toLowerCase();
    $("#who").innerHTML = esc(me) + ' <button class="btn" id="out">Sign out</button>';
    $("#out").onclick = function () { auth.signOut(); };
    db.collection("admins").limit(1).get().then(function () {   // rules let only owner/helpers read this
      role = OWNERS.indexOf(me) >= 0 ? "owner" : "helper";
      document.querySelectorAll("[data-owner]").forEach(function (a) { a.hidden = role !== "owner"; });
      document.getElementById("tabs").hidden = false;
      return loadAll();
    }).then(route, function (e) {
      signInScreen(e.code === "permission-denied" ? me + " does not have admin access." : e.message);
    });
  });

  var sel = document.getElementById("subject");
  sel.innerHTML = Object.keys(SUBJECTS).map(function (k) { return '<option value="' + k + '">' + esc(SUBJECTS[k].name) + "</option>"; }).join("");
  sel.onchange = function () { subject = sel.value; loadAll().then(route); };

  // ---------------------------------------------------------------- data
  function all(q) { return q.get().then(function (s) { return s.docs.map(function (d) { var x = d.data(); x._id = d.id; return x; }); }); }
  function loadAll() {
    app.innerHTML = '<p class="mxa-msg">Loading data…</p>';
    return Promise.all([
      all(db.collection("enrollments").where("subject", "==", subject)),
      all(db.collection("users")),
      all(db.collection("attempts").where("subject", "==", subject).orderBy("t", "desc").limit(3000)),
      all(db.collection("gradings").where("subject", "==", subject)),
      all(db.collection("assignments").where("subject", "==", subject)),
      all(db.collection("submissions").where("subject", "==", subject)),
      role === "owner" ? all(db.collection("admins")) : Promise.resolve([])
    ]).then(function (r) {
      var users = {};
      r[1].forEach(function (u) { users[u._id] = u; });
      D = { en: r[0], users: users, attempts: r[2], gradings: r[3], assignments: r[4], submissions: r[5], admins: r[6] };
      D.students = D.en.map(function (e) { var u = users[e.email] || {}; return Object.assign({}, u, { email: e.email, en: e }); });
      var n = D.en.filter(function (e) { return e.access === "requested"; }).length;
      $("#reqn").textContent = n || "";
    });
  }

  // ---------------------------------------------------------------- router
  window.onhashchange = route;
  function route() {
    if (!D) return;
    var tab = (location.hash || "#dashboard").slice(1);
    if ((tab === "mocks" || tab === "helpers") && role !== "owner") tab = "dashboard";
    document.querySelectorAll(".mxa-tabs a").forEach(function (a) { a.classList.toggle("on", a.getAttribute("href") === "#" + tab); });
    ({ dashboard: dashboard, requests: requests, students: students, marking: marking, mocks: mocks, helpers: helpers }[tab] || dashboard)();
  }
  function reload() { return loadAll().then(route); }

  // ---------------------------------------------------------------- dashboard
  function dashboard() {
    var now = Date.now(), d7 = now - 7 * 864e5, d30 = now - 30 * 864e5;
    var att = D.attempts, recent = att.filter(function (a) { var t = ts(a.t); return t && t >= d30; });
    var scored = att.filter(function (a) { return typeof a.pct === "number"; });
    var avg = scored.length ? Math.round(scored.reduce(function (s, a) { return s + a.pct; }, 0) / scored.length) : 0;
    var active7 = {}; att.forEach(function (a) { var t = ts(a.t); if (t && t >= d7) active7[a.email] = 1; });
    var newUsers = D.students.filter(function (s) { var t = ts(s.created); return t && t >= d30; }).length;
    var k = function (v, l) { return '<div class="kpi"><b>' + v + "</b><span>" + l + "</span></div>"; };
    // attempts per day, last 30 days
    var days = [], counts = {};
    recent.forEach(function (a) { var x = day(a.t); counts[x] = (counts[x] || 0) + 1; });
    for (var i = 29; i >= 0; i--) days.push(new Date(now - i * 864e5).toISOString().slice(0, 10));
    var max = Math.max.apply(null, days.map(function (x) { return counts[x] || 0; }).concat([1]));
    var bars = days.map(function (x) { var c = counts[x] || 0; return '<div style="height:' + Math.max(1, c / max * 100) + '%" data-t="' + x.slice(5) + ": " + c + '"></div>'; }).join("");
    // chapter performance from practice attempts
    var ch = {};
    att.forEach(function (a) {
      if (!a.chapters || String(a.chapters).indexOf(",") >= 0 || typeof a.pct !== "number" || !/practice/i.test(a.kind || "")) return;
      var c = ch[a.chapters] = ch[a.chapters] || [0, 0]; c[0] += a.pct; c[1] += 1;
    });
    var titles = {}; SUBJECTS[subject].chapters.forEach(function (c) { titles[c[0]] = c[1]; });
    var chRows = Object.keys(ch).map(function (c) { return [c, Math.round(ch[c][0] / ch[c][1]), ch[c][1]]; }).sort(function (a, b) { return a[1] - b[1]; });
    var group = function (key) {
      var g = {}, label = {}; D.students.forEach(function (s) { var raw = (s[key] || "").trim().replace(/\s+/g, " ") || "—", v = raw.toLowerCase().replace(/[^a-z0-9 ]/g, ""); label[v] = label[v] || raw; g[v] = (g[v] || 0) + 1; });   // "Skans" / "SKANS" / "skans" count together
      var rows = Object.keys(g).map(function (x) { return [label[x], g[x]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 10);
      var m = rows.length ? rows[0][1] : 1;
      return rows.map(function (r) { return '<div class="hbar"><span>' + esc(r[0]) + '</span><i style="width:' + r[1] / m * 100 + '%"></i><b>' + r[1] + "</b></div>"; }).join("");
    };
    app.innerHTML = "<h2>Dashboard · " + esc(SUBJECTS[subject].name) + "</h2>" +
      '<div class="kpis">' + k(D.students.length, "students") + k(D.en.filter(function (e) { return e.access === "approved"; }).length, "full access") +
      k(D.en.filter(function (e) { return e.access === "requested"; }).length, "requests waiting") + k(Object.keys(active7).length, "active in last 7 days") +
      k(newUsers, "new in last 30 days") + k(recent.length, "attempts, last 30 days") + k(avg + "%", "average score") + k(D.gradings.length, "AI-graded papers") + "</div>" +
      '<div class="card"><h3 style="margin-top:0">Attempts per day (last 30 days)</h3><div class="bars">' + bars + "</div></div>" +
      '<div class="grid2"><div class="card"><h3 style="margin-top:0">Chapters by average practice score (weakest first)</h3>' +
      (chRows.length ? chRows.map(function (r) {
        return '<div class="hbar"><span>Ch ' + r[0] + " " + esc(titles[r[0]] || "") + '</span><i class="' + (r[1] < 50 ? "bad" : r[1] < 70 ? "mid" : "") +
          '" style="width:' + r[1] + '%"></i><b>' + r[1] + "%</b></div>";
      }).join("") : '<p class="muted">No practice attempts yet.</p>') + "</div>" +
      '<div class="card"><h3 style="margin-top:0">Institutes</h3>' + group("institute") + '<h3>Cities</h3>' + group("city") + "</div></div>";
  }

  // ---------------------------------------------------------------- access
  function setAccess(email, access, btn) {
    if (btn) btn.disabled = true;
    return call("setAccess", { email: email, subject: subject, access: access }).then(reload, function (e) { alertBox(e.message); if (btn) btn.disabled = false; });
  }
  function alertBox(msg) { var p = document.createElement("p"); p.className = "err"; p.textContent = msg; app.prepend(p); }
  function accessButtons(s) {
    var a = s.en.access || "free", b = [];
    if (a !== "approved") b.push('<button class="btn primary" data-set="approved" data-email="' + esc(s.email) + '">Approve</button>');
    if (a === "requested") b.push('<button class="btn" data-set="free" data-email="' + esc(s.email) + '">Reject</button>');
    if (a === "approved") b.push('<button class="btn" data-set="free" data-email="' + esc(s.email) + '">Revoke</button>');
    if (a !== "blocked") b.push('<button class="btn red" data-set="blocked" data-email="' + esc(s.email) + '">Block</button>');
    return b.join("");
  }
  function wireAccess(root) {
    root.querySelectorAll("[data-set]").forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        if (b.dataset.set === "blocked" && !confirmBox("Block " + b.dataset.email + "? They will not be able to practise.")) return;
        setAccess(b.dataset.email, b.dataset.set, b);
      };
    });
  }
  function confirmBox(msg) { return window.confirm(msg); }

  function requests() {
    var rows = D.students.filter(function (s) { return s.en.access === "requested"; })
      .sort(function (a, b) { return (a.en.requestedAt || 0) - (b.en.requestedAt || 0); });
    app.innerHTML = "<h2>Access requests</h2>" + (rows.length ? '<div class="card"><table><tr><th>Requested</th><th>Student</th><th>Institute / city</th>' +
      "<th>ICAP reg. no.</th><th>Free use</th><th>Note</th><th></th></tr>" + rows.map(function (s) {
        return '<tr><td>' + fmt(s.en.requestedAt) + "</td><td><b>" + esc(s.name) + "</b><br>" + esc(s.email) + "<br>" + esc(s.phone) +
          "</td><td>" + esc(s.institute) + "<br>" + esc(s.city) + "</td><td>" + esc(s.icapRegNo || "—") + "</td><td>" + (s.en.mcqsUsed || (s.en.seenM || []).length || 0) +
          " MCQs<br>" + (s.en.mockPapers || 0) + " mocks</td><td>" + esc(s.en.note) + '</td><td style="white-space:nowrap">' + accessButtons(s) + "</td></tr>";
      }).join("") + "</table></div>" : '<p class="mxa-msg">No requests waiting. 🎉</p>');
    wireAccess(app);
  }

  // ---------------------------------------------------------------- students
  function students() {
    app.innerHTML = '<h2>Students</h2><div class="tools"><input type="search" id="q" placeholder="Search name, email, phone, ICAP no., institute, city">' +
      '<select id="fa"><option value="">All access</option><option>approved</option><option>requested</option><option>free</option><option>blocked</option></select>' +
      '<button class="btn" id="exp">Export CSV</button><span class="muted" id="cnt"></span></div><div class="card"><table id="tbl"></table></div>';
    var last = {};
    D.attempts.forEach(function (a) { var t = ts(a.t); if (t && (!last[a.email] || t > last[a.email])) last[a.email] = t; });
    function filtered() {
      var q = $("#q").value.toLowerCase().trim(), fa = $("#fa").value;
      return D.students.filter(function (s) {
        if (fa && (s.en.access || "free") !== fa) return false;
        return !q || [s.name, s.email, s.phone, s.icapRegNo, s.institute, s.city].join(" ").toLowerCase().indexOf(q) >= 0;
      }).sort(function (a, b) { return (last[b.email] || 0) - (last[a.email] || 0); });
    }
    function draw() {
      var rows = filtered();
      $("#cnt").textContent = rows.length + " students";
      $("#tbl").innerHTML = "<tr><th>Student</th><th>Phone</th><th>ICAP reg. no.</th><th>Institute</th><th>City</th><th>Access</th><th>Last practice</th></tr>" +
        rows.map(function (s) {
          return '<tr class="click" data-e="' + esc(s.email) + '"><td><b>' + esc(s.name) + "</b><br><span class=muted>" + esc(s.email) + "</span></td><td>" + esc(s.phone) +
            "</td><td>" + esc(s.icapRegNo || "—") + "</td><td>" + esc(s.institute) + "</td><td>" + esc(s.city) + "</td><td>" + pill(s.en.access) + "</td><td>" + fmt(last[s.email]) + "</td></tr>";
        }).join("");
      document.querySelectorAll("#tbl tr.click").forEach(function (tr) { tr.onclick = function () { profile(tr.dataset.e); }; });
    }
    $("#q").oninput = draw;
    $("#fa").onchange = draw;
    $("#exp").onclick = function () {
      csv([["Name", "Email", "Phone", "ICAP reg. no.", "Institute", "City", "Access", "MCQs used", "Mock papers", "Last practice"]].concat(filtered().map(function (s) {
        return [s.name, s.email, s.phone, s.icapRegNo, s.institute, s.city, s.en.access, s.en.mcqsUsed || (s.en.seenM || []).length, s.en.mockPapers, last[s.email] ? last[s.email].toISOString() : ""];
      })), "students-" + subject + ".csv");
    };
    draw();
  }

  function drawer(html) {
    var d = $(".drawer") || document.body.appendChild(Object.assign(document.createElement("div"), { className: "drawer" }));
    d.innerHTML = '<button class="btn x">Close ✕</button>' + html;
    $(".x", d).onclick = function () { d.remove(); };
    return d;
  }

  function profile(email) {
    var s = D.students.filter(function (x) { return x.email === email; })[0];
    if (!s) return;
    var att = D.attempts.filter(function (a) { return a.email === email; });
    var gr = D.gradings.filter(function (g) { return g.email === email; });
    var sub = D.submissions.filter(function (x) { return x.email === email; });
    var titles = {}; D.assignments.forEach(function (a) { titles[a._id] = a.title; });
    var d = drawer("<h2>" + esc(s.name) + "</h2><p>" + esc(email) + " · " + esc(s.phone) + "<br>" + esc(s.institute) + " · " + esc(s.city) +
      "<br>ICAP reg. no.: <b>" + esc(s.icapRegNo || "not given") + "</b></p><p style=\"margin:10px 0\">" + pill(s.en.access) +
      (s.en.approvedAt ? ' <span class="muted">approved ' + fmt(s.en.approvedAt) + (s.en.approvedBy ? " by " + esc(s.en.approvedBy) : "") + "</span>" : "") + "</p>" +
      "<p>" + accessButtons(s) + "</p>" +
      "<h3>Usage</h3><p>" + (s.en.mcqsUsed || (s.en.seenM || []).length || 0) + " MCQs seen · " + (s.en.mockPapers || 0) + " mock papers · " + att.length + " attempts</p>" +
      "<h3>Assigned mocks</h3>" + (sub.length ? "<table><tr><th>Mock</th><th>Submitted</th><th>Score</th></tr>" + sub.map(function (x) {
        return "<tr><td>" + esc(titles[x.assignment] || x.assignment) + "</td><td>" + (x.submitted ? fmt(x.submitted) : "started, not submitted") + "</td><td>" +
          (x.max ? x.total + "/" + x.max + " (" + x.pct + "%)" : "—") + "</td></tr>";
      }).join("") + "</table>" : '<p class="muted">None.</p>') +
      "<h3>AI-graded papers</h3>" + (gr.length ? "<table><tr><th>When</th><th>Paper</th><th>Marks</th><th></th></tr>" + gr.map(function (g) {
        return "<tr><td>" + fmt(g.created) + "</td><td>" + esc(g.paper) + "</td><td>" + g.marks + "/" + g.max + '</td><td><button class="btn" data-g="' + g._id + '">Review</button></td></tr>';
      }).join("") + "</table>" : '<p class="muted">None.</p>') +
      "<h3>Attempts</h3>" + (att.length ? "<table><tr><th>When</th><th>Type</th><th>Chapters</th><th>Mode</th><th>Score</th></tr>" + att.slice(0, 200).map(function (a) {
        return "<tr><td>" + fmt(a.t) + "</td><td>" + esc(a.kind) + "</td><td>" + esc(a.chapters) + "</td><td>" + esc(a.mode) + "</td><td>" +
          (a.questions ? a.correct + "/" + a.questions + " (" + a.pct + "%)" : "—") + "</td></tr>";
      }).join("") + "</table>" : '<p class="muted">None.</p>'));
    wireAccess(d);
    d.querySelectorAll("[data-g]").forEach(function (b) { b.onclick = function () { review("grading", b.dataset.g); }; });
  }

  // ---------------------------------------------------------------- AI marking review
  function marking() {
    var titles = {}; D.assignments.forEach(function (a) { titles[a._id] = a.title; });
    var items = D.gradings.map(function (g) { return { kind: "grading", id: g._id, t: g.created, email: g.email, what: "Self-built mock " + g.paper, marks: g.marks, max: g.max, reviewed: g.review }; })
      .concat(D.submissions.filter(function (s) { return s.secb; }).map(function (s) {
        return { kind: "submission", id: s._id, t: s.submitted, email: s.email, what: "Assigned: " + (titles[s.assignment] || s.assignment), marks: s.secb.total, max: s.secb.max, reviewed: s.review };
      })).sort(function (a, b) { return (ts(b.t) || 0) - (ts(a.t) || 0); });
    app.innerHTML = "<h2>AI marking</h2>" + (items.length ? '<div class="card"><table><tr><th>When</th><th>Student</th><th>Paper</th><th>Q2–Q7 marks</th><th>Reviewed</th></tr>' +
      items.map(function (x) {
        var u = D.users[x.email] || {};
        return '<tr class="click" data-k="' + x.kind + '" data-id="' + esc(x.id) + '"><td>' + fmt(x.t) + "</td><td>" + esc(u.name || x.email) + "</td><td>" + esc(x.what) +
          "</td><td>" + x.marks + "/" + x.max + "</td><td>" + (x.reviewed ? '<span class="ok">✔ ' + esc(x.reviewed.by) + "</span>" : '<span class="muted">not yet</span>') + "</td></tr>";
      }).join("") + "</table></div>" : '<p class="mxa-msg">No AI-marked papers yet.</p>');
    app.querySelectorAll("tr.click").forEach(function (tr) { tr.onclick = function () { review(tr.dataset.k, tr.dataset.id); }; });
  }

  function review(kind, id) {
    var doc = (kind === "grading" ? D.gradings : D.submissions).filter(function (x) { return x._id === id; })[0];
    if (!doc) return;
    var perQ = (kind === "grading" ? doc.detail : (doc.secb || {}).perQ) || [], u = D.users[doc.email] || {};
    var d = drawer("<h2>Review marks</h2><p><b>" + esc(u.name || doc.email) + "</b> · " + esc(doc.email) + "<br>" + (kind === "grading" ? "Paper " + esc(doc.paper) : "Assigned mock") +
      " · " + fmt(kind === "grading" ? doc.created : doc.submitted) + (doc.model ? ' · <span class="muted">' + esc(doc.model) + "</span>" : "") + "</p>" +
      '<p class="files" id="files"></p>' + (doc.overall || (doc.secb && doc.secb.overall) ? "<h3>AI summary</h3><p>" + esc(doc.overall || doc.secb.overall) + "</p>" : "") +
      perQ.map(function (q) {
        return "<h3>Question " + q.number + " · " + esc(q.topic || "") + " (" + q.marks + "/" + q.max + ')</h3><table class="parts"><tr><th>Part</th><th>Marks</th><th>AI feedback</th></tr>' +
          q.parts.map(function (p) {
            return "<tr><td>(" + esc(p.label) + ')</td><td><input type="number" step="0.5" min="0" max="' + p.max + '" value="' + p.awarded + '" data-q="' + esc(q.id) +
              '" data-p="' + esc(p.label) + '"> / ' + p.max + "</td><td>" + esc(p.feedback) + "</td></tr>";
          }).join("") + "</table>";
      }).join("") + '<p style="margin-top:16px"><button class="btn primary" id="saveMarks">Save marks</button> <span id="sv"></span></p>');
    var files = $("#files", d);
    if (doc.driveFolder) files.innerHTML = '<a href="' + esc(doc.driveFolder) + '" target="_blank" rel="noopener">Answer sheets (Google Drive) ↗</a>';
    (doc.files || []).forEach(function (path, i) {
      firebase.storage().ref(path).getDownloadURL().then(function (url) {
        files.insertAdjacentHTML("beforeend", '<a href="' + url + '" target="_blank" rel="noopener">Page ' + (i + 1) + " ↗</a>");
      });
    });
    $("#saveMarks", d).onclick = function () {
      var parts = {};
      d.querySelectorAll("input[data-q]").forEach(function (i) { (parts[i.dataset.q] = parts[i.dataset.q] || {})[i.dataset.p] = Number(i.value); });
      this.disabled = true;
      call("reviewMarks", { kind: kind, id: id, parts: parts }).then(function (r) {
        $("#sv", d).innerHTML = '<span class="ok">Saved. New Q2–Q7 total: ' + r.total + "</span>";
        loadAll();
      }, function (e) { $("#sv", d).innerHTML = '<span class="err">' + esc(e.message) + "</span>"; $("#saveMarks", d).disabled = false; });
    };
  }

  // ---------------------------------------------------------------- assigned mocks (owner)
  function mocks() {
    var S = SUBJECTS[subject], inst = {};
    D.students.forEach(function (s) { if (s.institute) inst[s.institute.trim()] = 1; });
    var subs = {}; D.submissions.forEach(function (s) { (subs[s.assignment] = subs[s.assignment] || []).push(s); });
    var def = new Date(Date.now() + 7 * 864e5); def.setHours(23, 59, 0, 0);
    var local = new Date(def.getTime() - def.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
    app.innerHTML = "<h2>Assigned mocks</h2><div class=\"card\"><h3 style=\"margin-top:0\">Create a mock</h3><div class=\"form\">" +
      '<label>Title<input id="mt" maxlength="120" placeholder="e.g. Week 3 test: Chapters 1-5"></label>' +
      '<label>Type<select id="mty"><option value="full">Full ICAP paper (15 MCQs + Q2–Q7, AI-marked)</option><option value="mcq">MCQs only</option></select></label>' +
      '<label id="mnw" hidden>Number of MCQs<input id="mn" type="number" min="5" max="100" value="30"></label>' +
      '<label>Deadline<input id="md" type="datetime-local" value="' + local + '"></label>' +
      '<label>Send to<select id="mtg"><option value="all">All approved students</option><option value="institute">One institute</option><option value="emails">Chosen students</option></select></label>' +
      '<label id="miw" hidden>Institute<select id="mi">' + Object.keys(inst).sort().map(function (i) { return "<option>" + esc(i) + "</option>"; }).join("") + "</select></label></div>" +
      '<div id="mew" hidden><h3>Choose students</h3><div class="chips">' + D.students.filter(function (s) { return s.en.access === "approved"; }).map(function (s) {
        return '<label><input type="checkbox" value="' + esc(s.email) + '">' + esc(s.name || s.email) + "</label>";
      }).join("") + "</div></div>" +
      '<h3>Chapters</h3><div class="chips" id="mch">' + S.chapters.map(function (c) { return '<label><input type="checkbox" value="' + c[0] + '"> Ch ' + c[0] + " " + esc(c[1]) + "</label>"; }).join("") +
      '</div><p style="margin-top:14px"><button class="btn primary" id="mgo">Create and assign</button> <span id="mres"></span></p></div>' +
      "<h3>Mocks</h3>" + (D.assignments.length ? '<div class="card"><table><tr><th>Mock</th><th>Sent to</th><th>Deadline</th><th>Submitted</th><th>Average</th><th></th></tr>' +
        D.assignments.sort(function (a, b) { return (ts(b.created) || 0) - (ts(a.created) || 0); }).map(function (a) {
          var s = (subs[a._id] || []).filter(function (x) { return x.submitted; }), avg = s.length ? Math.round(s.reduce(function (t, x) { return t + x.pct; }, 0) / s.length) : null;
          var to = a.target.kind === "all" ? "All approved" : a.target.kind === "institute" ? esc(a.target.institute) : (a.target.emails || []).length + " students";
          return '<tr class="click" data-a="' + a._id + '"><td><b>' + esc(a.title) + "</b><br><span class=muted>" + (a.type === "mcq" ? a.mcq.length + " MCQs" : "15 MCQs + Q2–Q7") +
            " · Ch " + a.chapters.join(", ") + "</span></td><td>" + to + "</td><td>" + fmt(a.deadline) + "</td><td>" + s.length + "</td><td>" + (avg == null ? "—" : avg + "%") +
            "</td><td>" + (a.active ? '<button class="btn red" data-close="' + a._id + '">Close</button>' : '<span class="muted">closed</span>') + "</td></tr>";
        }).join("") + "</table></div>" : '<p class="muted">No mocks yet.</p>');
    $("#mty").onchange = function () { $("#mnw").hidden = this.value !== "mcq"; };
    $("#mtg").onchange = function () { $("#miw").hidden = this.value !== "institute"; $("#mew").hidden = this.value !== "emails"; };
    $("#mgo").onclick = function () {
      var chs = [].map.call(document.querySelectorAll("#mch input:checked"), function (i) { return +i.value; });
      var tg = $("#mtg").value, target = { kind: tg };
      if (tg === "institute") target.institute = $("#mi").value;
      if (tg === "emails") target.emails = [].map.call(document.querySelectorAll("#mew input:checked"), function (i) { return i.value; });
      var dl = new Date($("#md").value).getTime();
      if (!$("#mt").value.trim()) return ($("#mres").innerHTML = '<span class="err">Add a title.</span>');
      if (!chs.length) return ($("#mres").innerHTML = '<span class="err">Tick at least one chapter.</span>');
      if (tg === "emails" && !target.emails.length) return ($("#mres").innerHTML = '<span class="err">Choose at least one student.</span>');
      var btn = this; btn.disabled = true;
      call("createAssignment", { subject: subject, title: $("#mt").value.trim(), type: $("#mty").value, n: +$("#mn").value, chapters: chs, target: target, deadline: dl })
        .then(reload, function (e) { $("#mres").innerHTML = '<span class="err">' + esc(e.message) + "</span>"; btn.disabled = false; });
    };
    app.querySelectorAll("[data-close]").forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        if (!confirmBox("Close this mock? Students will no longer be able to start or submit it.")) return;
        call("closeAssignment", { id: b.dataset.close }).then(reload, function (er) { alertBox(er.message); });
      };
    });
    app.querySelectorAll("tr[data-a]").forEach(function (tr) {
      tr.onclick = function () {
        var a = D.assignments.filter(function (x) { return x._id === tr.dataset.a; })[0], s = subs[a._id] || [];
        var d = drawer("<h2>" + esc(a.title) + "</h2><p>Deadline " + fmt(a.deadline) + " · created by " + esc(a.createdBy) + "</p><table><tr><th>Student</th><th>Submitted</th><th>MCQs</th><th>Q2–Q7</th><th>Total</th><th></th></tr>" +
          (s.length ? s.map(function (x) {
            var u = D.users[x.email] || {};
            return "<tr><td>" + esc(u.name || x.email) + "</td><td>" + (x.submitted ? fmt(x.submitted) + (x.submittedLate ? " (late)" : "") : "started") + "</td><td>" +
              (x.mcq ? x.mcq.correct + "/" + x.mcq.total : "—") + "</td><td>" + (x.secb ? x.secb.total + "/" + x.secb.max : "—") + "</td><td>" + (x.max ? x.total + "/" + x.max + " (" + x.pct + "%)" : "—") +
              "</td><td>" + (x.secb ? '<button class="btn" data-s="' + esc(x._id) + '">Review</button>' : "") + "</td></tr>";
          }).join("") : '<tr><td colspan="6" class="muted">No submissions yet.</td></tr>') + "</table>");
        d.querySelectorAll("[data-s]").forEach(function (b) { b.onclick = function () { review("submission", b.dataset.s); }; });
      };
    });
  }

  // ---------------------------------------------------------------- helpers (owner)
  function helpers() {
    app.innerHTML = '<h2>Helpers</h2><div class="card"><p class="muted">Helpers can approve, reject, revoke or block access, see students and reports, and review AI marks. ' +
      "Only you can create mocks and manage helpers.</p><div class=\"tools\" style=\"margin-top:12px\"><input type=\"email\" id=\"he\" placeholder=\"helper's Google email\">" +
      '<button class="btn primary" id="hadd">Add helper</button><span id="hres"></span></div><table><tr><th>Email</th><th>Role</th><th></th></tr>' +
      OWNERS.map(function (o) { return "<tr><td>" + esc(o) + "</td><td>owner</td><td></td></tr>"; }).join("") +
      D.admins.map(function (a) { return "<tr><td>" + esc(a._id) + "</td><td>" + esc(a.role) + '</td><td><button class="btn red" data-rm="' + esc(a._id) + '">Remove</button></td></tr>'; }).join("") +
      "</table></div>";
    $("#hadd").onclick = function () {
      var e = $("#he").value.trim();
      call("setAdmin", { email: e, role: "helper" }).then(reload, function (er) { $("#hres").innerHTML = '<span class="err">' + esc(er.message) + "</span>"; });
    };
    app.querySelectorAll("[data-rm]").forEach(function (b) {
      b.onclick = function () { if (confirmBox("Remove " + b.dataset.rm + " as a helper?")) call("setAdmin", { email: b.dataset.rm, role: null }).then(reload, function (er) { alertBox(er.message); }); };
    });
  }
})();
