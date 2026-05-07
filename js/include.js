(function () {
  const root = document.documentElement;
  root.classList.add("theme-openai");
  root.classList.remove("dark");
  if (document.getElementById("openai-preload-style")) return;
  const style = document.createElement("style");
  style.id = "openai-preload-style";
  style.textContent = `
    html.theme-openai{
      color-scheme: light;
      --oa-bg: #ffffff;
      --oa-surface: #f7f7f5;
      --oa-panel: #ffffff;
      --oa-border: rgba(17, 24, 39, 0.10);
      --oa-text: #111827;
      --oa-muted: #6b7280;
      --oa-accent: #111827;
      --oa-accent-contrast: #ffffff;
      --oa-header-h: 64px;
      --oa-sidebar-w: 252px;
      --oa-gutter-l: 16px;
      --oa-gutter-r: 28px;
    }
    html.theme-openai body{background:var(--oa-bg) !important;color:var(--oa-text) !important}
    html.theme-openai header,
    html.theme-openai header.glass-panel{background:var(--oa-surface) !important;border-bottom:1px solid var(--oa-border) !important}
    html.theme-openai .layout-sidebar{background:var(--oa-surface) !important;border-right:1px solid var(--oa-border) !important}
    html.theme-openai main{padding-right:var(--oa-gutter-r) !important;scrollbar-gutter:stable !important}
    html.theme-openai #new-order-modal{z-index:100 !important}
    html.theme-openai #smartorder-root{z-index:100 !important}
    html.theme-openai .glass-panel,
    html.theme-openai .metric-card{background:var(--oa-panel) !important;border:1px solid var(--oa-border) !important;box-shadow:none !important}
    html.theme-openai .text-primary{color:var(--oa-accent) !important}
    html.theme-openai .bg-primary{background-color:var(--oa-accent) !important}
    html.theme-openai button.bg-primary,
    html.theme-openai a.bg-primary{color:var(--oa-accent-contrast) !important}
    html.theme-openai button.bg-gradient-to-br,
    html.theme-openai a.bg-gradient-to-br,
    html.theme-openai button.bg-gradient-to-r,
    html.theme-openai a.bg-gradient-to-r{color:var(--oa-accent-contrast) !important}
    html.theme-openai .bg-primary\\/10{background-color:rgba(17, 24, 39, 0.06) !important}
    html.theme-openai .bg-primary\\/15{background-color:rgba(17, 24, 39, 0.10) !important}
    html.theme-openai .bg-primary\\/20{background-color:rgba(17, 24, 39, 0.14) !important}
    html.theme-openai .hover\\:bg-primary\\/90:hover{background-color:rgba(17, 24, 39, 0.92) !important}
    html.theme-openai .from-primary{--tw-gradient-from: var(--oa-accent) !important}
    html.theme-openai .to-orange-600{--tw-gradient-to: var(--oa-accent) !important}
    html.theme-openai .to-orange-400{--tw-gradient-to: var(--oa-accent) !important}
    html.theme-openai .bg-gradient-to-br.from-primary,
    html.theme-openai .bg-gradient-to-r.from-primary{background-image:linear-gradient(135deg, var(--oa-accent), var(--oa-accent)) !important}
    html.theme-openai .pill{background:rgba(15, 23, 42, 0.04) !important;border:1px solid var(--oa-border) !important;color:var(--oa-text) !important}
    html.theme-openai body[data-active="overview"] .glass-panel{background:var(--oa-panel) !important;border:1px solid var(--oa-border) !important;box-shadow:none !important}
    html.theme-openai body[data-active="overview"] .metric-card{background:var(--oa-panel) !important;border:1px solid var(--oa-border) !important;box-shadow:none !important}
    html.theme-openai body[data-active="overview"] a#btn-cs-new-order-top,
    html.theme-openai body[data-active="overview"] a#btn-cs-new-order-top *{color:var(--oa-accent-contrast) !important}
  `;
  document.head.appendChild(style);
})();

// Authentication Check
(function() {
    const isLoginPage = window.location.pathname.endsWith('login.html');
    const userId = localStorage.getItem('user_id');
    const role = (localStorage.getItem('role') || '').toLowerCase();
    
    if (!userId && !isLoginPage) {
        window.location.href = 'login.html';
    } else if (userId && isLoginPage) {
        window.location.href = 'dashboard.html';
    }
})();

document.addEventListener("DOMContentLoaded", async function () {
  async function loadInto(id, url) {
    const el = document.getElementById(id);
    if (!el) return;
    try {
      const res = await fetch(url, { cache: "no-cache" });
      const html = await res.text();
      el.innerHTML = html;
    } catch (e) {
      console.error("Gagal memuat:", url, e);
    }
  }

  await Promise.all([
    loadInto("include-header", "partials/header.html"),
    loadInto("include-sidebar", "partials/sidebar.html"),
    loadInto("include-footer", "partials/footer.html"),
  ]);
  
  function injectTopNav() {
    try {
      const container = document.getElementById("top-nav-list");
      if (!container) return;
      container.innerHTML = "";
      // Read only visible sidebar menus (match current sidebar view)
      const allLinks = Array.from(document.querySelectorAll(".layout-sidebar nav a[data-menu]"));
      const links = allLinks.filter(a => {
        const cs = window.getComputedStyle(a);
        const notHiddenClass = !a.classList.contains("hidden");
        const notStyleHidden = a.style.display !== "none";
        const notComputedHidden = cs.display !== "none" && cs.visibility !== "hidden";
        return notHiddenClass && notStyleHidden && notComputedHidden;
      });
      links.forEach(a => {
        const href = a.getAttribute("href") || "#";
        const labelEl = a.querySelector("span:last-child");
        const label = labelEl ? labelEl.textContent : (a.getAttribute("data-menu") || href);
        const menuKey = a.getAttribute("data-menu") || "";
        const item = document.createElement("a");
        item.href = href;
        item.dataset.menu = menuKey;
        item.className = "px-2.5 py-1 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors";
        item.textContent = label;
        container.appendChild(item);
      });
      // Highlight active
      const active = document.body.dataset.active;
      if (active) {
        const current = container.querySelector(`a[data-menu="${active}"]`);
        if (current) current.className = "px-2.5 py-1 rounded-full bg-primary/15 text-white border border-primary/30";
      }
    } catch (e) {
      console.error("injectTopNav error:", e);
    }
  }

  function getTheme() {
    try {
      const saved = localStorage.getItem("theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch (_) {}
    return "light";
  }

  function setTheme(theme) {
    try { localStorage.setItem("theme", theme); } catch (_) {}
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.remove("dark");
    } else {
      root.classList.add("dark");
    }
  }

  function getUiTheme() {
    return "openai";
  }

  function setUiTheme(uiTheme) {
    try { localStorage.setItem("ui_theme", uiTheme); } catch (_) {}
  }

  function applyUiTheme(uiTheme) {
    const root = document.documentElement;
    root.classList.add("theme-openai");
    setTheme("light");
    applyTheme("light");
  }

  function getRole() {
    // 1. Check URL param (for debug/override)
    const params = new URLSearchParams(location.search);
    const qRole = params.get("role");
    if (qRole) return qRole;

    // 2. Check localStorage (from login)
    try {
        const saved = localStorage.getItem("role");
        if (saved) return saved;
    } catch (_) {}

    // 3. Default (should be handled by login check, but fallback to super_admin or limited)
    return "super_admin"; 
  }

  function setRole(role) {
    // Only update if not already set or if explicitly changing via debug
    // In production, login sets this.
    try { localStorage.setItem("role", role); } catch (_) {}
    document.body.dataset.role = role;
  }

  const ROLE_MENUS = {
    super_admin: ["overview","orders","products","commissions","users","finance","team","audit","analytics","campaigns","crm","clients","meta_config","cpr_calculator"],
    cs: ["overview","orders","crm","clients"],
    keuangan: ["overview","finance","orders","commissions","clients"],
    advertiser: ["overview","orders","analytics","campaigns"],
    crm: ["overview","crm","orders","clients"],
    editor: ["overview","orders"],
    "team bengkel": ["overview", "orders", "campaigns"]
  };

  function applySidebarByRole(role) {
    const allowed = ROLE_MENUS[role.toLowerCase()] || ROLE_MENUS.super_admin;
    const links = document.querySelectorAll(".layout-sidebar nav a[data-menu]");
    links.forEach(a => {
      const menu = a.getAttribute("data-menu");
      if (!allowed.includes(menu)) {
        a.style.display = "none";
      } else {
        a.style.display = "";
      }
    });
  }

  function checkPageAccess(role) {
    const active = document.body.dataset.active;
    if (!active) return; // No restriction if page doesn't define its menu key

    const allowed = ROLE_MENUS[role.toLowerCase()] || ROLE_MENUS.super_admin;
    if (!allowed.includes(active)) {
        console.warn(`Access denied for role ${role} on page ${active}`);
        // Redirect to the first allowed page
        // Map menu key to file - simple heuristic or map
        // For now, default to index.html which usually redirects to dashboard (overview)
        // But if overview is not allowed (e.g. some role?), we need a fallback.
        // Assuming overview is allowed for everyone or safe fallback.
        // Actually, let's just alert and go back or home.
        alert("Anda tidak memiliki akses ke halaman ini.");
        window.location.href = "dashboard.html"; 
    }
  }

  function updateProfileInfo() {
    // Find the profile section in header
    // It's the last element in the flex container
    const profileContainer = document.querySelector("header .flex.items-center.gap-3:last-child");
    if (!profileContainer) return;

    const userName = localStorage.getItem('user_name') || 'User';
    const userRole = localStorage.getItem('role') || 'guest';
    const userInitials = userName.substring(0, 2).toUpperCase();

    // Find the specific elements inside
    // The structure is: div.flex > div.header-profile-icon + div.hidden.sm:block > p + p
    const profileBox = profileContainer.querySelector(".cursor-default");
    
    if (profileBox) {
        // Update Initials
        const icon = profileBox.querySelector(".header-profile-icon");
        if (icon) icon.textContent = userInitials;

        // Update Name and Role
        const textContainer = profileBox.querySelector(".hidden.sm\\:block");
        if (textContainer) {
            const ps = textContainer.querySelectorAll("p");
            if (ps.length >= 2) {
                ps[0].textContent = userName;
                ps[1].textContent = userRole.replace('_', ' ').toUpperCase();
            }
        }

    }
  }

  // Helper to remove old debug selector if it exists
  function removeDebugSelector() {
    const sel = document.getElementById("role-select");
    if (sel && sel.parentNode) sel.parentNode.remove();
  }


  function injectModeSelector(theme) {
    const rightCluster = Array.from(document.querySelectorAll("header .flex.items-center.gap-3")).pop();
    if (!rightCluster) return;
    const wrap = document.createElement("div");
    wrap.className = "hidden md:flex items-center gap-2";
    const sel = document.createElement("select");
    sel.id = "theme-select";
    sel.className = "text-[11px] bg-white/5 border border-white/10 text-secondary/80 rounded-lg pl-2 pr-6 py-1 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/50";
    const opts = [["dark","Dark"],["light","Light"]];
    opts.forEach(([val,label]) => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = label;
      if (val === theme) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => {
      const t = sel.value === "light" ? "light" : "dark";
      setTheme(t);
      applyTheme(t);
    });
    wrap.appendChild(sel);
    rightCluster.insertBefore(wrap, rightCluster.firstChild);
  }

  function injectUiThemeSelector(uiTheme) {
    const rightCluster = Array.from(document.querySelectorAll("header .flex.items-center.gap-3")).pop();
    if (!rightCluster) return;
    const wrap = document.createElement("div");
    wrap.className = "hidden md:flex items-center gap-2";
    const sel = document.createElement("select");
    sel.id = "ui-theme-select";
    sel.className = "text-[11px] bg-white/5 border border-white/10 text-secondary/80 rounded-lg pl-2 pr-6 py-1 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/50";
    const opts = [["default", "Default"], ["openai", "OpenAI"]];
    opts.forEach(([val, label]) => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = label;
      if (val === uiTheme) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => {
      const next = sel.value === "openai" ? "openai" : "default";
      setUiTheme(next);
      applyUiTheme(next);
      const modeWrap = document.getElementById("theme-select") ? document.getElementById("theme-select").closest("div") : null;
      if (modeWrap) modeWrap.style.display = next === "openai" ? "none" : "";
    });
    wrap.appendChild(sel);
    rightCluster.insertBefore(wrap, rightCluster.firstChild);
  }

  function ensureSidebarHideCSS() {
    if (document.getElementById("sidebar-hide-style")) return;
    const style = document.createElement("style");
    style.id = "sidebar-hide-style";
    style.textContent = `
      .layout-sidebar{display:flex;}
      .sidebar-hidden .layout-sidebar{display:none;}
    `;
    document.head.appendChild(style);
  }

  function ensureSurfaceThemeCSS() {
    if (document.getElementById("surface-theme-style")) return;
    const style = document.createElement("style");
    style.id = "surface-theme-style";
    style.textContent = `
      html:not(.dark) body.bg-background-light{background-color:#ffffff !important}
      html:not(.dark) .glass-surface{background:none !important}
      .glass-panel{background:#ffffff;border:1px solid rgba(242,223,214,0.55);box-shadow:0 8px 22px rgba(239,114,37,0.07),0 1px 2px rgba(13,59,102,0.05),inset 0 0 0 1px rgba(249,233,225,0.5)}
      .metric-card{background:#ffffff;border:1px solid rgba(242,223,214,0.55);box-shadow:0 8px 22px rgba(239,114,37,0.07),0 1px 2px rgba(13,59,102,0.05),inset 0 0 0 1px rgba(249,233,225,0.5)}
      html:not(.dark) .metric-card .bg-gradient-to-r{background-image:linear-gradient(90deg,#ffd8c2 0%,#ffb48d 30%,#ef7225 100%) !important;border-radius:9999px !important}
      html:not(.dark) .metric-card .from-primary\\/25,
      html:not(.dark) .metric-card .via-secondary\\/10,
      html:not(.dark) .metric-card .to-white\\/5{background-image:linear-gradient(90deg,#ffd8c2 0%,#ffb48d 30%,#ef7225 100%) !important}
      .pill{background:rgba(239,114,37,0.09);border:1px solid rgba(239,114,37,0.22)}
      .bg-sidebar-dark{background-color:#ffffff}
      .border-slate-800{border-color:rgba(15,23,42,0.12)}
      .dark .glass-panel{background:rgba(6,12,31,0.94);border:1px solid rgba(148,163,184,0.18)}
      .dark .metric-card{background:linear-gradient(135deg,rgba(15,23,42,0.98),rgba(15,23,42,0.92));border:1px solid rgba(255,255,255,0.06)}
      .dark .pill{background:linear-gradient(135deg,rgba(239,114,37,0.18),rgba(13,59,102,0.22));border:1px solid rgba(148,163,184,0.25)}
      .dark .bg-sidebar-dark{background-color:#101922}
      .dark .border-slate-800{border-color:#1f2937}
      .layout-sidebar nav a{color:#475569}
      .layout-sidebar nav a:hover{color:#0f172a;background:rgba(239,114,37,0.06)}
      .layout-sidebar nav a.is-active{color:#0f172a;background:rgba(239,114,37,0.12);border:1px solid rgba(239,114,37,0.28)}
      .dark .layout-sidebar nav a{color:rgba(203,213,225,0.7)}
      .dark .layout-sidebar nav a:hover{color:#ffffff;background:rgba(13,59,102,0.16)}
      .dark .layout-sidebar nav a.is-active{color:#ffffff;background:rgba(13,59,102,0.22);border:1px solid rgba(13,59,102,0.32)}
      .glass-panel table thead th{color:#475569}
      .glass-panel table tbody td{color:#0f172a}
      .dark .glass-panel table thead th{color:#94a3b8}
      .dark .glass-panel table tbody td{color:#e5e7eb}
      header .text-secondary\\/80{color:#475569}
      .dark header .text-secondary\\/80{color:#cbd5e1}
      html:not(.dark) .border-white\\/10{border-color:rgba(242,223,214,0.45)}
      html:not(.dark) .border-white\\/5{border-color:rgba(242,223,214,0.35)}
      .dark .border-white\\/10{border-color:rgba(255,255,255,0.08)}
      .dark .border-white\\/5{border-color:rgba(255,255,255,0.05)}
      html:not(.dark) .bg-white\\/5{background-color:rgba(239,114,37,0.03)}
      html:not(.dark) .hover\\:bg-white\\/10:hover{background-color:rgba(239,114,37,0.06)}
      html:not(.dark) header{background:#ffffff !important;border-bottom:1px solid #f2dfd6 !important}
      html:not(.dark) body .header-brand{color:#ef7225 !important;font-weight:700 !important}
      html:not(.dark) body[data-active] .header-brand{color:#ef7225 !important;font-weight:700 !important}
      html:not(.dark) .header-subtitle{color:#64748b !important}
      html:not(.dark) .header-status{color:#64748b !important}
      html:not(.dark) .btn-new-campaign{display:none !important}
      html:not(.dark) header .material-symbols-outlined{color:#64748b !important}
      html:not(.dark) header .text-primary{color:#ef7225 !important}
      html:not(.dark) header .bg-white\\/5{background-color:#f8fafc !important;border-color:#e2e8f0 !important}
      html:not(.dark) header .bg-white\\/5:hover{background-color:#f1f5f9 !important}
      html:not(.dark) header .text-secondary\\/80{color:#64748b !important}
      html:not(.dark) header select{padding-right:1.75rem !important;background-image:url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2364748b' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e") !important;background-position:right 0.25rem center !important;background-repeat:no-repeat !important;background-size:1.25em 1.25em !important;-webkit-appearance:none !important;-moz-appearance:none !important;appearance:none !important}
      html:not(.dark) header select:focus{outline:2px solid transparent !important;outline-offset:2px !important;--tw-ring-offset-shadow:var(--tw-ring-inset) 0 0 0 var(--tw-ring-offset-width) var(--tw-ring-offset-color) !important;--tw-ring-shadow:var(--tw-ring-inset) 0 0 0 calc(1px + var(--tw-ring-offset-width)) var(--tw-ring-color) !important;box-shadow:var(--tw-ring-offset-shadow),var(--tw-ring-shadow),var(--tw-shadow, 0 0 #0000) !important;--tw-ring-opacity:1 !important;--tw-ring-color:rgba(239,114,37,0.5) !important}
      html:not(.dark) header .text-secondary\\/70{color:#94a3b8 !important}
      html:not(.dark) header .shadow-black\\/40{box-shadow:0 10px 15px -3px rgba(239,114,37,0.1),0 4px 6px -2px rgba(239,114,37,0.05) !important}
      html:not(.dark) header .bg-white{background-color:#ffffff !important;border:1px solid #f2dfd6}
      html:not(.dark) .header-profile-icon{background:linear-gradient(135deg,#ef7225 0%,#f97316 100%) !important;color:#ffffff !important;box-shadow:0 2px 4px rgba(239,114,37,0.25)}
      
      html:not(.dark) select{
        background-color:#ffffff !important;border:1px solid #e2e8f0 !important;color:#0f172a !important;
        -webkit-appearance:none !important;-moz-appearance:none !important;appearance:none !important;
        padding-right:1.75rem !important;
        background-image:url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2364748b' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e") !important;
        background-position:right 0.4rem center !important;background-repeat:no-repeat !important;background-size:1.25em 1.25em !important;
      }
      html:not(.dark) select:focus{outline:2px solid transparent !important;outline-offset:2px !important;box-shadow:0 0 0 1px rgba(239,114,37,0.5) !important;border-color:rgba(239,114,37,0.5) !important}
      html:not(.dark) option{background-color:#ffffff;color:#0f172a}
      .dark select{
        background-color:rgba(255,255,255,0.06) !important;border:1px solid rgba(255,255,255,0.12) !important;color:#e5e7eb !important;
        -webkit-appearance:none !important;-moz-appearance:none !important;appearance:none !important;
        padding-right:1.75rem !important;
        background-image:url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23cbd5e1' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e") !important;
        background-position:right 0.4rem center !important;background-repeat:no-repeat !important;background-size:1.25em 1.25em !important;
      }
      .dark select:hover{background-color:rgba(255,255,255,0.09) !important}
      .dark select:focus{outline:2px solid transparent !important;outline-offset:2px !important;box-shadow:0 0 0 1px rgba(239,114,37,0.5) !important;border-color:rgba(239,114,37,0.5) !important}
      .dark option{background-color:#101922;color:#e5e7eb}
      select::-ms-expand{display:none}
    `;
    document.head.appendChild(style);
  }

  function ensureOpenAIThemeCSS() {
    if (document.getElementById("openai-theme-style")) return;
    const style = document.createElement("style");
    style.id = "openai-theme-style";
    style.textContent = `
      html.theme-openai{
        color-scheme: light;
        --oa-bg: #ffffff;
        --oa-surface: #f7f7f5;
        --oa-panel: #ffffff;
        --oa-border: rgba(17, 24, 39, 0.10);
        --oa-border-strong: rgba(17, 24, 39, 0.16);
        --oa-text: #111827;
        --oa-muted: #6b7280;
        --oa-muted-2: #9ca3af;
        --oa-accent: #111827;
        --oa-accent-2: #111827;
        --oa-accent-contrast: #ffffff;
        --oa-header-h: 64px;
        --oa-sidebar-w: 252px;
        --oa-gutter-l: 16px;
        --oa-gutter-r: 28px;
      }
      html.theme-openai body{background:var(--oa-bg) !important;color:var(--oa-text) !important}
      html.theme-openai body{overflow:hidden !important}
      html.theme-openai body > .relative.z-10.min-h-screen{height:100vh !important;min-height:100vh !important}
      html.theme-openai .glass-surface{background:none !important}
      html.theme-openai .dark\\:block{display:none !important}
      html.theme-openai .glass-panel{
        background:var(--oa-panel) !important;
        border:1px solid var(--oa-border) !important;
        backdrop-filter:none !important;
        -webkit-backdrop-filter:none !important;
        box-shadow:none !important;
      }
      html.theme-openai .metric-card{
        background:var(--oa-panel) !important;
        border:1px solid var(--oa-border) !important;
        box-shadow:none !important;
      }
      html.theme-openai header{
        background:var(--oa-surface) !important;
        border-bottom:1px solid var(--oa-border) !important;
        position: sticky !important;
        top: 0 !important;
        z-index: 60 !important;
      }
      html.theme-openai #new-order-modal{z-index:100 !important}
      html.theme-openai #smartorder-root{z-index:100 !important}
      html.theme-openai header.glass-panel{
        background:var(--oa-surface) !important;
      }
      html.theme-openai #top-nav{
        display:none !important;
      }
      html.theme-openai body .header-brand{color:#0f172a !important;letter-spacing:0.22em !important}
      html.theme-openai .header-subtitle,
      html.theme-openai .header-status,
      html.theme-openai .text-secondary\\/80,
      html.theme-openai .text-secondary\\/70,
      html.theme-openai .text-secondary\\/60{color:var(--oa-muted) !important}
      html.theme-openai .text-white,
      html.theme-openai .text-white\\/90{color:var(--oa-text) !important}
      html.theme-openai .text-primary{color:var(--oa-accent) !important}
      html.theme-openai .bg-primary{background-color:var(--oa-accent) !important}
      html.theme-openai button.bg-primary,
      html.theme-openai a.bg-primary{color:var(--oa-accent-contrast) !important}
      html.theme-openai button.bg-gradient-to-br,
      html.theme-openai a.bg-gradient-to-br,
      html.theme-openai button.bg-gradient-to-r,
      html.theme-openai a.bg-gradient-to-r{color:var(--oa-accent-contrast) !important}
      html.theme-openai .bg-primary\\/10{background-color:rgba(17, 24, 39, 0.06) !important}
      html.theme-openai .bg-primary\\/15{background-color:rgba(17, 24, 39, 0.10) !important}
      html.theme-openai .bg-primary\\/20{background-color:rgba(17, 24, 39, 0.14) !important}
      html.theme-openai .hover\\:bg-primary\\/90:hover{background-color:rgba(17, 24, 39, 0.92) !important}
      html.theme-openai .pill{
        background:rgba(15, 23, 42, 0.04) !important;
        border:1px solid var(--oa-border) !important;
        color:var(--oa-text) !important;
      }
      html.theme-openai .header-profile-icon{
        background:rgba(15, 23, 42, 0.06) !important;
        color:var(--oa-text) !important;
        box-shadow:none !important;
      }
      html.theme-openai .bg-white\\/5{background-color:rgba(15, 23, 42, 0.04) !important;border-color:var(--oa-border) !important}
      html.theme-openai .hover\\:bg-white\\/10:hover{background-color:rgba(15, 23, 42, 0.06) !important}
      html.theme-openai .border-white\\/10{border-color:var(--oa-border) !important}
      html.theme-openai .border-white\\/5{border-color:rgba(15, 23, 42, 0.06) !important}
      html.theme-openai .from-primary{--tw-gradient-from: var(--oa-accent) !important}
      html.theme-openai .to-orange-600{--tw-gradient-to: var(--oa-accent-2) !important}
      html.theme-openai .to-orange-400{--tw-gradient-to: var(--oa-accent-2) !important}
      html.theme-openai .bg-gradient-to-br.from-primary,
      html.theme-openai .bg-gradient-to-r.from-primary{background-image:linear-gradient(135deg, var(--oa-accent), var(--oa-accent)) !important}

      html.theme-openai #include-sidebar{width:0 !important;flex:0 0 0 !important}
      html.theme-openai .layout-sidebar{
        position: fixed !important;
        left: 0 !important;
        top: var(--oa-header-h) !important;
        bottom: 0 !important;
        width: var(--oa-sidebar-w) !important;
        border-radius: 0 !important;
        padding: 12px !important;
        background: var(--oa-surface) !important;
        border: none !important;
        border-right: 1px solid var(--oa-border) !important;
        box-shadow: none !important;
        overflow: hidden !important;
      }
      html.theme-openai .layout-sidebar nav{margin-top:8px !important}
      html.theme-openai .layout-sidebar.w-56{width:var(--oa-sidebar-w) !important}
      html.theme-openai .layout-sidebar .bg-white{background:transparent !important;border-color:var(--oa-border) !important}
      html.theme-openai .layout-sidebar .dark\\:bg-white\\/5{background:transparent !important}

      html.theme-openai body > .relative.z-10 > .flex-1.max-w-7xl.mx-auto.w-full{
        max-width: none !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
        padding-left: calc(var(--oa-sidebar-w) + var(--oa-gutter-l)) !important;
        padding-right: var(--oa-gutter-r) !important;
      }
      html.theme-openai #include-header > header .max-w-7xl.mx-auto{
        max-width: none !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
      }
      html.theme-openai #include-header > header .max-w-7xl.mx-auto.px-6{
        padding-left: var(--oa-gutter-l) !important;
        padding-right: var(--oa-gutter-r) !important;
      }
      html.theme-openai #sidebar-toggle{display:none !important}

      html.theme-openai .layout-sidebar nav a{
        color:var(--oa-muted) !important;
      }
      html.theme-openai .layout-sidebar nav a:hover{
        color:var(--oa-text) !important;
        background:rgba(17, 24, 39, 0.05) !important;
      }
      html.theme-openai .layout-sidebar nav a.is-active{
        color:var(--oa-text) !important;
        background:rgba(17, 24, 39, 0.06) !important;
        border:1px solid rgba(17, 24, 39, 0.14) !important;
      }
      html.theme-openai .layout-sidebar .sidebar-logout{
        color:#b91c1c !important;
        background:transparent !important;
        border:1px solid rgba(185, 28, 28, 0.18) !important;
      }
      html.theme-openai .layout-sidebar .sidebar-logout:hover{
        background:rgba(185, 28, 28, 0.06) !important;
      }

      html.theme-openai main{gap:12px !important}
      html.theme-openai main{
        overflow:auto !important;
        max-height: calc(100vh - var(--oa-header-h)) !important;
        padding-bottom: 16px !important;
        padding-right: var(--oa-gutter-r) !important;
        scrollbar-gutter: stable !important;
      }
      html.theme-openai .grid{gap:10px !important}
      html.theme-openai .metric-card{padding:12px 14px !important}
      html.theme-openai .max-w-7xl.mx-auto.w-full.px-6.py-6{padding-top:16px !important;padding-bottom:16px !important}
      html.theme-openai table{border-collapse:separate !important;border-spacing:0 !important}
      html.theme-openai table thead{background:rgba(17, 24, 39, 0.03) !important}
      html.theme-openai table th,
      html.theme-openai table td{padding:8px 12px !important}
      html.theme-openai table tbody tr:hover td{background:rgba(17, 24, 39, 0.03) !important}
      html.theme-openai table tbody .text-secondary\\/70{color:var(--oa-muted) !important}
      html.theme-openai ::-webkit-scrollbar-thumb{background:rgba(17,24,39,0.20) !important}
      html.theme-openai body[data-active="overview"].bg-background-light{background-color:var(--oa-bg) !important}
      html.theme-openai body[data-active="overview"] .glass-panel{background:var(--oa-panel) !important;border:1px solid var(--oa-border) !important;box-shadow:none !important}
      html.theme-openai body[data-active="overview"] .metric-card{background:var(--oa-panel) !important;border:1px solid var(--oa-border) !important;box-shadow:none !important}
      html.theme-openai body[data-active="overview"] header.glass-panel{background:var(--oa-surface) !important;border-bottom:1px solid var(--oa-border) !important}
      html.theme-openai body[data-active="overview"] .layout-sidebar{background:var(--oa-surface) !important;border-right:1px solid var(--oa-border) !important}
      html.theme-openai body[data-active="overview"] a#btn-cs-new-order-top,
      html.theme-openai body[data-active="overview"] a#btn-cs-new-order-top *{color:var(--oa-accent-contrast) !important}
    `;
    document.head.appendChild(style);
  }

  function setActiveSidebar() {
    const active = document.body.dataset.active;
    const navLinks = document.querySelectorAll(".layout-sidebar nav a");
    navLinks.forEach((a) => {
      a.classList.remove("is-active");
      const icon = a.querySelector(".material-symbols-outlined");
      if (icon) icon.classList.remove("text-primary");
    });
    if (!active) return;
    const current = document.querySelector(`.layout-sidebar nav a[data-menu="${active}"]`);
    if (!current) return;
    current.classList.add("is-active");
    const icon = current.querySelector(".material-symbols-outlined");
    if (icon) icon.classList.add("text-primary");
  }

  function initToggle() {
    const toggle = document.getElementById("sidebar-toggle");
    const sidebar = document.querySelector(".layout-sidebar");
    if (toggle && sidebar) {
      toggle.addEventListener("click", function () {
        document.body.classList.toggle("sidebar-hidden");
      });
    }
  }

  function initLogout() {
    const sidebarLogout = document.getElementById("sidebar-logout");
    if (!sidebarLogout) return;
    sidebarLogout.addEventListener("click", function (e) {
      e.preventDefault();
      try { localStorage.clear(); } catch (_) {}
      window.location.href = "login.html";
    });
  }

  function applyPagePermissions(role) {
    try {
      const isOrders = document.body && document.body.dataset && document.body.dataset.active === "orders";
      if (isOrders) {
        const btn = document.getElementById("btn-input-baru");
        const safeRole = (role || "").toLowerCase();
        const canInput = safeRole === "super_admin" || safeRole === "cs" || safeRole === "crm";
        
        if (btn) {
          if (canInput) {
            btn.removeAttribute("disabled");
            // Use inline-flex or remove style completely if class handles it
            btn.style.display = "inline-flex"; 
            btn.classList.remove("hidden");
          } else {
            btn.setAttribute("disabled","disabled");
            btn.style.display = "none";
          }
        }
      }
    } catch (e) {
      console.error("Error applying page permissions:", e);
    }
  }

  const role = getRole();
  setRole(role);
  const uiTheme = getUiTheme();
  applyUiTheme(uiTheme);
  const theme = getTheme();
  // injectRoleSelector(role); // Removed in favor of real profile
  updateProfileInfo();
  applySidebarByRole(role);
  checkPageAccess(role);
  ensureSidebarHideCSS();
  ensureOpenAIThemeCSS();
  setActiveSidebar();
  injectTopNav();
  initToggle();
  initLogout();
  applyPagePermissions(role);
  document.body.classList.remove("sidebar-hidden");
}); 
