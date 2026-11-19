/* Free CISA book (mirakx.com/learn/cisa). The PDF is never on the page or behind a link:
   bookLead emails it as an attachment (typed address or Google sign-in). Report: /admin/#book. */
(function () {
  "use strict";
  var FN = "https://asia-south1-mirakx-35901.cloudfunctions.net/", PAGE = "https://mirakx.com/learn/cisa/";
  var FBCONF = { apiKey: "AIzaSyAA-ddrw3baU8EGPIZgSay0gOFqQi1ScOs", authDomain: "mirakx-35901.firebaseapp.com", projectId: "mirakx-35901",
    appId: "1:513880017632:web:42705981297f201b26de85" };
  var SDK = "https://www.gstatic.com/firebasejs/10.14.1/";
  var dlg = document.getElementById("bookdlg");
  if (!dlg) return;
  var form = document.getElementById("bkform"), msg = document.getElementById("bkmsg"), btn = form.querySelector("button[type=submit]");
  var src = form.elements.source, other = document.getElementById("bkother"), gbtn = document.getElementById("bkgoogle"), idToken = null;

  function call(name, data) {
    return fetch(FN + name, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: data }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j.error) throw new Error(j.error.message || "Something went wrong. Please try again."); return j.result; });
  }
  function track(type) { call("bookEvent", { type: type }).catch(function () { }); }
  function show(id) {
    ["bkform", "bksent"].forEach(function (x) { document.getElementById(x).hidden = x !== id; });
    document.getElementById("bkintro").hidden = id !== "bkform";
    if (!dlg.open) dlg.showModal();
  }

  try { if (!sessionStorage.getItem("mx_cisa_visit")) { sessionStorage.setItem("mx_cisa_visit", "1"); track("visit"); } } catch (e) { track("visit"); }

  var q = new URLSearchParams(location.search);
  try { localStorage.removeItem("mx_cisa_book_t"); } catch (e) { }   // left over from the old download links

  src.onchange = function () { other.hidden = src.value !== "Other"; };
  document.querySelectorAll("a[data-book]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      track("formOpen");
      show("bkform");
    });
  });
  dlg.querySelector(".x").onclick = function () { dlg.close(); };
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });   // click on the backdrop
  document.getElementById("bkchange").onclick = function () { show("bkform"); form.elements.email.focus(); };

  // Continue with Google: fills name and email from a verified Google account.
  function script(s) { return new Promise(function (ok, no) { var el = document.createElement("script"); el.src = s; el.onload = ok; el.onerror = no; document.head.appendChild(el); }); }
  gbtn.onclick = function () {
    msg.textContent = "";
    (window.firebase ? Promise.resolve() : script(SDK + "firebase-app-compat.js").then(function () { return script(SDK + "firebase-auth-compat.js"); }))
      .then(function () {
        if (!window.firebase.apps.length) window.firebase.initializeApp(FBCONF);
        var p = new window.firebase.auth.GoogleAuthProvider();
        p.setCustomParameters({ prompt: "select_account" });
        return window.firebase.auth().signInWithPopup(p);
      })
      .then(function (r) { return r.user.getIdToken().then(function (t) { return [r.user, t]; }); })
      .then(function (x) {
        idToken = x[1];
        form.elements.name.value = x[0].displayName || form.elements.name.value;
        form.elements.email.value = x[0].email;
        form.elements.email.readOnly = true;
        gbtn.hidden = true; document.getElementById("bkor").hidden = true;
        document.getElementById("bkverified").hidden = false;
        (form.elements.name.value ? src : form.elements.name).focus();
      }, function (e) { if (e && e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") msg.textContent = "Google sign-in didn't work. You can type your details instead."; });
  };

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = form.elements;
    if (!f.name.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.value.trim())) { msg.textContent = "Please enter your name and a valid email address."; return; }
    if (!src.value) { msg.textContent = "Please tell us how you heard about the book."; return; }
    var prep = form.querySelector("input[name=certprepx]:checked");
    var utm = ["utm_source", "utm_medium", "utm_campaign"].map(function (k) { return q.get(k); }).filter(Boolean).join(" / ");
    msg.textContent = ""; btn.disabled = true; btn.textContent = "Sending the book…";
    call("bookLead", {
      idToken: idToken, name: f.name.value, email: f.email.value, phone: f.phone.value, source: src.value, sourceOther: f.sourceOther.value,
      certprepx: prep ? prep.value : "", liveSessions: f.liveSessions.checked, updates: f.updates.checked,
      website: f.website.value, utm: utm, referrer: document.referrer
    }).then(function (r) {
      btn.disabled = false; btn.textContent = "Send me the book";
      document.querySelector("#bksent [data-email]").textContent = r.email || f.email.value.trim();
      document.getElementById("bkagain").hidden = !r.again;
      show("bksent");
    }, function (err) {
      msg.textContent = /fetch|network/i.test(err.message) ? "We couldn't reach the server. Please check your connection and try again." : err.message;
      btn.disabled = false; btn.textContent = "Send me the book";
    });
  });

  var text = "Free CISA Complete Study Guide (352 pages, 100 practice questions) and a free daily CISA video course: " + PAGE;
  dlg.querySelectorAll("[data-share]").forEach(function (b) {
    b.onclick = function () {
      var k = b.dataset.share;
      if (k === "WhatsApp") window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener");
      if (k === "LinkedIn") window.open("https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(PAGE), "_blank", "noopener");
      if (k === "Copy") { (navigator.clipboard ? navigator.clipboard.writeText(PAGE) : Promise.reject()).then(function () { b.textContent = "Link copied ✓"; }, function () { b.textContent = PAGE; }); }
      track("share" + k);
    };
  });
})();
