/* Free CISA book: a short form before the first download (stored by the bookLead Cloud Function), plus visit/download counters.
   Returning visitors (remembered on this device) download straight away. */
(function () {
  "use strict";
  var FN = "https://asia-south1-mirakx-35901.cloudfunctions.net/", KEY = "mx_cisa_book", PAGE = "https://mirakx.com/learn/cisa/";
  var dlg = document.getElementById("bookdlg");
  if (!dlg) return;
  function call(name, data) {
    return fetch(FN + name, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: data }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j.error) throw new Error(j.error.message || "Something went wrong. Please try again."); return j.result; });
  }
  function track(type) { call("bookEvent", { type: type }).catch(function () { }); }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function remembered() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function download(url) { var a = document.createElement("a"); a.href = url; a.download = ""; document.body.appendChild(a); a.click(); a.remove(); }

  try { if (!sessionStorage.getItem("mx_cisa_visit")) { sessionStorage.setItem("mx_cisa_visit", "1"); track("visit"); } } catch (e) { track("visit"); }

  var form = document.getElementById("bkform"), msg = document.getElementById("bkmsg"), btn = form.querySelector("button[type=submit]");
  var src = form.elements.source, other = document.getElementById("bkother");
  src.onchange = function () { other.hidden = src.value !== "Other"; };

  document.querySelectorAll("a[data-book]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      if (remembered()) { track("download"); return; }   // let the normal link download the PDF
      e.preventDefault();
      track("formOpen");
      dlg.showModal();
      form.elements.name.focus();
    });
  });
  dlg.querySelector(".x").onclick = function () { dlg.close(); };
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });   // click on the backdrop

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = form.elements;
    if (!f.name.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.value.trim())) { msg.textContent = "Please enter your name and a valid email address."; return; }
    if (!src.value) { msg.textContent = "Please tell us how you heard about the book."; return; }
    var prep = form.querySelector("input[name=certprepx]:checked");
    var q = new URLSearchParams(location.search), utm = ["utm_source", "utm_medium", "utm_campaign"].map(function (k) { return q.get(k); }).filter(Boolean).join(" / ");
    msg.textContent = ""; btn.disabled = true; btn.textContent = "Preparing your download…";
    call("bookLead", {
      name: f.name.value, email: f.email.value, phone: f.phone.value, source: src.value, sourceOther: f.sourceOther.value,
      certprepx: prep ? prep.value : "", liveSessions: f.liveSessions.checked, updates: f.updates.checked,
      website: f.website.value, utm: utm, referrer: document.referrer
    }).catch(function (err) {
      if (err instanceof TypeError) return { url: form.dataset.pdf };   // backend unreachable: never block the free book
      throw err;
    }).then(function (r) {
      store(KEY, f.email.value.trim().toLowerCase());
      download(r.url);
      form.hidden = true;
      var done = document.getElementById("bkdone");
      done.querySelector("[data-email]").textContent = f.email.value.trim();
      done.querySelector("[data-pdf]").href = r.url;
      done.hidden = false;
    }, function (err) {
      msg.textContent = err.message; btn.disabled = false; btn.textContent = "Download free PDF";
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
