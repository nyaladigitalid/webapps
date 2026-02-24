// Authentication Check
(function() {
    const isLoginPage = window.location.pathname.endsWith('login.html');
    const userId = localStorage.getItem('user_id');
    
    if (!userId && !isLoginPage) {
        window.location.href = 'login.html';
    } else if (userId && isLoginPage) {
        window.location.href = 'index.html';
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

  function getTheme() {
    try {
      const saved = localStorage.getItem("theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch (_) {}
    return "dark";
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
    super_admin: ["overview","orders","products","commissions","users","finance","team","audit","analytics","campaigns","crm","clients","meta_config"],
    cs: ["overview","orders","products","crm","clients"],
    keuangan: ["overview","finance","orders","products","commissions","clients"],
    advertiser: ["overview","orders","analytics","campaigns","meta_config","clients"],
    crm: ["overview","crm","orders","clients"],
    editor: ["overview"],
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
        window.location.href = "index.html"; 
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

        // Add Logout Button if not exists
        if (!document.getElementById('logout-btn')) {
            const logoutBtn = document.createElement("button");
            logoutBtn.id = "logout-btn";
            logoutBtn.className = "ml-2 h-8 w-8 flex items-center justify-center rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors";
            logoutBtn.title = "Keluar";
            logoutBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">logout</span>';
            logoutBtn.onclick = function() {
                localStorage.clear();
                window.location.href = 'login.html';
            };
            profileContainer.appendChild(logoutBtn);
        }
    }
  }

  // Helper to remove old debug selector if it exists
  function removeDebugSelector() {
    const sel = document.getElementById("role-select");
    if (sel && sel.parentNode) sel.parentNode.remove();
  }


  function injectThemeSelector(theme) {
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
      .glass-panel{background:#ffffff;border:1px solid #f2dfd6;box-shadow:0 8px 22px rgba(239,114,37,0.07),0 1px 2px rgba(13,59,102,0.05),inset 0 0 0 1px #f9e9e1}
      .metric-card{background:#ffffff;border:1px solid #f2dfd6;box-shadow:0 8px 22px rgba(239,114,37,0.07),0 1px 2px rgba(13,59,102,0.05),inset 0 0 0 1px #f9e9e1}
      html:not(.dark) .metric-card .bg-gradient-to-r{background-image:linear-gradient(90deg,#ffd8c2 0%,#ffb48d 30%,#ef7225 100%) !important;border-radius:9999px !important}
      html:not(.dark) .metric-card .from-primary\\/25,
      html:not(.dark) .metric-card .via-secondary\\/10,
      html:not(.dark) .metric-card .to-white\\/5{background-image:linear-gradient(90deg,#ffd8c2 0%,#ffb48d 30%,#ef7225 100%) !important}
      .pill{background:rgba(239,114,37,0.09);border:1px solid rgba(239,114,37,0.22)}
      .bg-sidebar-dark{background-color:#ffffff}
      .border-slate-800{border-color:rgba(15,23,42,0.12)}
      .dark .glass-panel{background:rgba(6,12,31,0.94);border:1px solid rgba(148,163,184,0.35)}
      .dark .metric-card{background:linear-gradient(135deg,rgba(15,23,42,0.98),rgba(15,23,42,0.92));border:1px solid rgba(255,255,255,0.1)}
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
      html:not(.dark) .border-white\\/10{border-color:#f2dfd6}
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

  function applyPagePermissions(role) {
    try {
      const isOrders = document.body && document.body.dataset && document.body.dataset.active === "orders";
      if (isOrders) {
        const btn = document.getElementById("btn-input-baru");
        const safeRole = (role || "").toLowerCase();
        const canInput = safeRole === "super_admin" || safeRole === "cs";
        
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
  const theme = getTheme();
  applyTheme(theme);
  // injectRoleSelector(role); // Removed in favor of real profile
  updateProfileInfo();
  injectThemeSelector(theme);
  applySidebarByRole(role);
  checkPageAccess(role);
  ensureSidebarHideCSS();
  ensureSurfaceThemeCSS();
  setActiveSidebar();
  initToggle();
  applyPagePermissions(role);
}); 
