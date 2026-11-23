/* =========================================================
   리턴픽 — app.js
   data.js 의 RETURNPICK_META / RETURNPICK_DEALS 를 읽어 화면을 그립니다.

   반품 가성비 점수(100점 만점) — data.js 값으로 실시간 계산
     · 할인율   최대 50점 : min(50, round(할인율 × 0.85))
     · 절약 금액 최대 25점 : 10만↑ 25 / 5만↑ 21 / 3만↑ 17 / 1만↑ 12 / 5천↑ 7 / 그 외 3
     · 상태 등급 최대 25점 : 박스 훼손 25 / 반품-최상 22 / 반품-상 18 / 반품-중 12 / 그 외 10
   ========================================================= */
(function () {
  "use strict";

  var META = window.RETURNPICK_META || {};
  var DEALS = (window.RETURNPICK_DEALS || []).slice();

  var state = {
    category: "all",
    query: "",
    sort: "score"
  };

  var $ = function (sel) { return document.querySelector(sel); };
  var won = function (n) { return n.toLocaleString("ko-KR") + "원"; };

  var gradeClass = function (grade) {
    if (!grade) return "grade-box";
    if (grade.indexOf("최상") > -1) return "grade-best";
    if (grade.indexOf("반품-상") > -1) return "grade-good";
    if (grade.indexOf("반품-중") > -1) return "grade-mid";
    return "grade-box";
  };

  function savingOf(item) {
    return Math.max(0, (item.original || 0) - (item.price || 0));
  }

  /* =========================================================
     가성비 점수
     ========================================================= */
  var SCORE_RULE = { discount: 50, saving: 25, grade: 25 };

  function discountPoints(rate) {
    return Math.min(SCORE_RULE.discount, Math.round((Number(rate) || 0) * 0.85));
  }

  function savingPoints(saving) {
    if (saving >= 100000) return 25;
    if (saving >= 50000) return 21;
    if (saving >= 30000) return 17;
    if (saving >= 10000) return 12;
    if (saving >= 5000) return 7;
    return 3;
  }

  var GRADE_POINTS = {
    "박스 훼손": 25,
    "반품-최상": 22,
    "반품-상": 18,
    "반품-중": 12
  };

  function gradePoints(grade) {
    return Object.prototype.hasOwnProperty.call(GRADE_POINTS, grade) ? GRADE_POINTS[grade] : 10;
  }

  var TIERS = [
    { min: 85, key: "hot", emoji: "🔥", label: "무조건 줍줍" },
    { min: 70, key: "good", emoji: "👍", label: "추천 특가" },
    { min: 55, key: "mid", emoji: "👌", label: "무난해요" },
    { min: -1, key: "low", emoji: "🤔", label: "살까말까" }
  ];

  function tierOf(total) {
    for (var i = 0; i < TIERS.length; i++) {
      if (total >= TIERS[i].min) return TIERS[i];
    }
    return TIERS[TIERS.length - 1];
  }

  function scoreBreakdown(item) {
    var parts = {
      discount: discountPoints(item.discount),
      saving: savingPoints(savingOf(item)),
      grade: gradePoints(item.grade)
    };
    parts.total = parts.discount + parts.saving + parts.grade;
    parts.tier = tierOf(parts.total);
    return parts;
  }

  function decorate(items) {
    return items.map(function (item) {
      var copy = {};
      for (var k in item) { if (Object.prototype.hasOwnProperty.call(item, k)) copy[k] = item[k]; }
      copy.saving = savingOf(item);
      copy.link = item.partnerUrl || item.url;
      copy.affiliate = !!item.partnerUrl;
      copy.score = scoreBreakdown(item);
      return copy;
    });
  }

  var ALL = decorate(DEALS);

  var CATEGORY_LABEL = (function () {
    var map = {};
    (META.categories || []).forEach(function (c) { map[c.key] = c.label; });
    return map;
  })();

  /* ---------- 날짜 ---------- */
  function formatStamp(iso, withDate) {
    if (!iso) return "-";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
    var parts = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false
    }).formatToParts(d).reduce(function (acc, p) { acc[p.type] = p.value; return acc; }, {});
    return withDate === false
      ? (parts.hour || "00") + ":" + (parts.minute || "00")
      : parts.month + "월 " + parts.day + "일 " + (parts.hour || "00") + ":" + (parts.minute || "00");
  }

  /* ---------- 통계 ---------- */
  function renderStats() {
    if (!ALL.length) return;
    var avg = Math.round(ALL.reduce(function (s, i) { return s + (i.discount || 0); }, 0) / ALL.length);
    var maxSave = ALL.reduce(function (m, i) { return Math.max(m, i.saving); }, 0);
    $("#statCount").textContent = ALL.length + "건";
    $("#statAvg").textContent = avg + "%";
    $("#statSave").textContent = won(maxSave);
  }

  /* ---------- 점수 기준 안내 ---------- */
  function renderScoreGuide() {
    var host = document.getElementById("scoreGuide");
    if (!host) return;
    var RANGE = { hot: "85+", good: "70–84", mid: "55–69", low: "~54" };
    var tierHtml = TIERS.map(function (t) {
      var range = RANGE[t.key];
      return '<i class="gt gt-' + t.key + '">' + t.emoji + " " + t.label + " " + range + "</i>";
    }).join("");
    host.innerHTML =
      '<span class="guide-formula"><strong>가성비 점수 산정 기준</strong>' +
        '<span class="guide-eq">할인율 50 · 절약액 25 · 상태등급 25</span></span>' +
      '<span class="guide-tiers">' + tierHtml + "</span>";
  }

  /* ---------- 히어로 추천 카드 ---------- */
  function renderHeroPick() {
    var host = document.getElementById("heroPick");
    if (!host || !ALL.length) return;
    var top = ALL.slice().sort(function (a, b) {
      if (b.score.total !== a.score.total) return b.score.total - a.score.total;
      if (b.discount !== a.discount) return b.discount - a.discount;
      return b.saving - a.saving;
    })[0];
    if (!top) return;
    host.innerHTML =
      '<a class="pick-card" href="' + esc(top.link) + '" target="_blank" rel="noopener noreferrer' +
        (top.affiliate ? " sponsored" : "") + '">' +
        '<div class="pick-thumb"><img src="' + esc(top.image) + '" alt="' + esc(top.name) + '">' +
          '<span class="pick-off">' + (top.discount || 0) + "%</span></div>" +
        '<div class="pick-body"><span class="pick-label">오늘의 가성비 1픽</span>' +
          '<p class="pick-title">' + esc(top.name) + "</p>" +
          '<p class="pick-score gt-' + top.score.tier.key + '">' + top.score.total + "점 · " +
            top.score.tier.emoji + " " + top.score.tier.label + "</p>" +
          '<div class="pick-price"><strong>' + top.price.toLocaleString("ko-KR") + "원</strong>" +
          "<del>" + won(top.original) + "</del></div></div></a>";
  }

  /* ---------- 카테고리 칩 ---------- */
  function renderChips() {
    var host = $("#categoryChips");
    var cats = (META.categories || [{ key: "all", label: "전체" }]);
    host.innerHTML = "";
    cats.forEach(function (cat) {
      var count = cat.key === "all"
        ? ALL.length
        : ALL.filter(function (i) { return i.category === cat.key; }).length;
      if (cat.key !== "all" && count === 0) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(state.category === cat.key));
      btn.dataset.key = cat.key;
      btn.innerHTML = cat.label + '<span class="chip-count">' + count + "</span>";
      btn.addEventListener("click", function () {
        state.category = cat.key;
        renderChips();
        renderGrid();
      });
      host.appendChild(btn);
    });
  }

  /* ---------- 정렬/필터 ---------- */
  function visibleItems() {
    var q = state.query.trim().toLowerCase();
    var list = ALL.filter(function (item) {
      if (state.category !== "all" && item.category !== state.category) return false;
      if (!q) return true;
      var hay = [item.name, item.sub, item.categoryPath, item.grade,
        CATEGORY_LABEL[item.category] || ""].join(" ").toLowerCase();
      return hay.indexOf(q) > -1;
    });
    list.sort(function (a, b) {
      if (state.sort === "price") return a.price - b.price;
      if (state.sort === "saving") return b.saving - a.saving;
      if (state.sort === "discount") {
        if (b.discount !== a.discount) return b.discount - a.discount;
        return a.price - b.price;
      }
      // 기본: 가성비 점수 높은순
      if (b.score.total !== a.score.total) return b.score.total - a.score.total;
      if (b.discount !== a.discount) return b.discount - a.discount;
      return a.price - b.price;
    });
    return list;
  }

  /* ---------- 카드 ---------- */
  function scoreBlock(item) {
    var s = item.score;
    var t = s.tier;
    var label = "가성비 점수 " + s.total + "점, " + t.label +
      ". 할인 " + s.discount + "점 + 절약 " + s.saving + "점 + 상태 " + s.grade + "점";
    return '<div class="score-box score-' + t.key + '" aria-label="' + esc(label) + '">' +
        '<div class="score-head">' +
          '<span class="score-num">' + s.total + "<em>점</em></span>" +
          '<span class="score-tier">' + t.emoji + " " + t.label + "</span>" +
        "</div>" +
        '<span class="score-bar" aria-hidden="true"><i style="width:' + s.total + '%"></i></span>' +
        '<span class="score-break" aria-hidden="true">할인 ' + s.discount + " + 절약 " + s.saving +
          " + 상태 " + s.grade + "</span>" +
      "</div>";
  }

  function cardEl(item) {
    var card = document.createElement("article");
    card.className = "card";

    var a = document.createElement("a");
    a.className = "card-link";
    a.href = item.link;
    a.target = "_blank";
    a.rel = "noopener noreferrer" + (item.affiliate ? " sponsored" : "");
    a.setAttribute("aria-label", item.name + " 쿠팡에서 보기");

    var thumb = document.createElement("div");
    thumb.className = "thumb";
    thumb.innerHTML =
      '<span class="badge badge-grade ' + gradeClass(item.grade) + '">' + esc(item.grade || "반품") + "</span>" +
      '<span class="badge badge-discount">' + (item.discount || 0) + "%</span>" +
      '<img loading="lazy" decoding="async" src="' + esc(item.image) + '" alt="' + esc(item.name) + '">';

    var body = document.createElement("div");
    body.className = "card-body";
    var stockHtml = item.stock
      ? '<span class="stock">🔥 ' + item.stock + "개 남음</span>"
      : "";

    body.innerHTML =
      '<p class="card-cat">' + esc(item.categoryPath || "") + "</p>" +
      '<h3 class="card-title">' + esc(item.name) + "</h3>" +
      '<p class="card-sub">' + esc(item.sub || "") + "</p>" +
      '<div class="price-row"><strong class="price">' + (item.price).toLocaleString("ko-KR") +
        "<span>원</span></strong><del class=\"original\">" + won(item.original) + "</del></div>" +
      scoreBlock(item) +
      '<div class="meta-row">' + stockHtml +
        '<span class="save-tag">' + won(item.saving) + " 절약</span></div>" +
      (item.condition ? '<p class="card-cond">' + esc(item.condition) + "</p>" : "") +
      '<span class="cta">특가 보러가기' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13"/><path d="M13 6l6 6-6 6"/></svg>' +
      "</span>";

    a.appendChild(thumb);
    a.appendChild(body);
    card.appendChild(a);
    return card;
  }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ---------- 목록 ---------- */
  function renderGrid() {
    var grid = $("#grid");
    var list = visibleItems();
    grid.innerHTML = "";
    var frag = document.createDocumentFragment();
    list.forEach(function (item) { frag.appendChild(cardEl(item)); });
    grid.appendChild(frag);
    $("#resultCount").textContent = "특가 " + list.length + "건";
    $("#empty").hidden = list.length !== 0;
    grid.hidden = list.length === 0;
  }

  /* ---------- 초기화 ---------- */
  function init() {
    var stamp = META.collectedAt || new Date().toISOString();
    var stampText = META.collectedAtLabel || (formatStamp(stamp) + " 기준");

    if ($("#headerUpdated")) $("#headerUpdated").textContent = formatStamp(stamp, false);
    if ($("#footerUpdated")) $("#footerUpdated").textContent = formatStamp(stamp);
    if ($("#collectedAt")) $("#collectedAt").textContent = stampText;
    if ($("#footerYear")) $("#footerYear").textContent = String(new Date(stamp).getFullYear());
    document.title = (META.siteName ? META.siteName + " — " : "") + "반품 특가만 골라 담았어요";

    renderScoreGuide();
    renderStats();
    renderHeroPick();
    renderChips();
    renderGrid();

    var search = $("#searchInput");
    var timer = null;
    search.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        state.query = search.value;
        renderGrid();
      }, 120);
    });

    $("#sortSelect").addEventListener("change", function (e) {
      state.sort = e.target.value;
      renderGrid();
    });

    $("#resetButton").addEventListener("click", function () {
      state.category = "all";
      state.query = "";
      state.sort = "score";
      search.value = "";
      $("#sortSelect").value = "score";
      renderChips();
      renderGrid();
    });

    // 이미지 로드 실패 시 회색 박스 유지
    document.addEventListener("error", function (e) {
      var t = e.target;
      if (t && t.tagName === "IMG" && t.closest(".thumb")) {
        t.style.visibility = "hidden";
      }
    }, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
