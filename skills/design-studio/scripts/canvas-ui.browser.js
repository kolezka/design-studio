(function () {
  const el = (id) => document.getElementById(id),
    canvas = el("canvas"),
    world = el("world"),
    nodes = el("nodes"),
    edges = el("edges"),
    inspector = el("inspector"),
    dialog = el("dialog"),
    full = el("dialogFrame");
  document.documentElement.dataset.theme = initial.theme;
  el("project").textContent = initial.projectName;
  el("project").title = initial.root;
  el("sideProject").textContent = initial.projectName;
  for (
    const [id, t, w, h] of [
      ["light", "light", initial.width, initial.height],
      ["dark", "dark", initial.width, initial.height],
      ["desktop", initial.theme, 1440, 900],
      ["tablet", initial.theme, 768, 1024],
      ["phone", initial.theme, 390, 844],
    ]
  ) {
    el(id).href = "/?theme=" + t + "&w=" + w + "&h=" + h;
    if (
      (id === initial.theme) ||
      (w === initial.width && h === initial.height && id !== "light" &&
        id !== "dark")
    ) el(id).setAttribute("aria-current", "page");
  }
  let data = [],
    panX = 50,
    panY = 75,
    zoom = 1,
    selected = null,
    selection = null,
    activeFrame = null,
    dialogKey = null,
    drag = null,
    requestId = 0,
    refreshToken = 0;
  const cards = new Map();
  const valid = (s) =>
    typeof s === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(s);
  const key = (d) => d.target + "/" + d.id + "/v" + d.version;
  const text = (x) => typeof x === "string" ? x : "";
  const title = (d) => text(d.meta.title) || d.id;
  function normalize(targets) {
    if (!Array.isArray(targets)) return [];
    const drafts = [];
    for (const group of targets) {
      if (!group || !valid(group.target) || !Array.isArray(group.drafts)) {
        continue;
      }
      for (const d of group.drafts) {
        if (
          !d || !valid(d.id) || d.target !== group.target ||
          !Array.isArray(d.versions)
        ) continue;
        const vs = [
          ...new Set(
            d.versions.filter((v) => Number.isSafeInteger(v) && v >= 0),
          ),
        ].sort((a, b) => a - b);
        if (vs.length) {
          drafts.push({
            target: group.target,
            id: d.id,
            meta: d.meta && typeof d.meta === "object" && !Array.isArray(d.meta)
              ? d.meta
              : {},
            metaError: text(d.metaError),
            versions: vs,
            versionHashes:
              d.versionHashes && typeof d.versionHashes === "object" &&
                !Array.isArray(d.versionHashes)
                ? d.versionHashes
                : {},
          });
        }
      }
    }
    const variants = new Map();
    for (const d of drafts) {
      d.variant = valid(d.meta.variant) ? d.meta.variant : null;
      d.variantWarnings = [];
      if (Object.prototype.hasOwnProperty.call(d.meta, "variant") && !d.variant) {
        d.variantWarnings.push("Invalid variant");
      }
      if (Object.prototype.hasOwnProperty.call(d.meta, "variantParent")) {
        if (!valid(d.meta.variantParent)) d.variantWarnings.push("Invalid variant parent");
        else if (!d.variant) d.variantWarnings.push("Variant parent without valid variant");
      }
      if (d.variant) {
        if (!variants.has(d.variant)) variants.set(d.variant, { parents: new Set(), drafts: [], invalid: false });
        const group = variants.get(d.variant);
        group.drafts.push(d);
        if (Object.prototype.hasOwnProperty.call(d.meta, "variantParent")) {
          if (valid(d.meta.variantParent)) group.parents.add(d.meta.variantParent);
          else group.invalid = true;
        } else group.parents.add(null);
      }
    }
    for (const [name, group] of variants) {
      const parents = [...group.parents];
      if (parents.length > 1) {
        group.warning = "Conflicting variant parents: " + parents.map((p) => p || "(none)").join(", ");
      } else if (group.invalid) {
        group.warning = "Invalid variant parent declaration";
      } else if (parents[0] && !variants.has(parents[0])) {
        group.warning = "Missing parent variant: " + parents[0];
      }
      group.parent = !group.warning && parents.length === 1 ? parents[0] : null;
    }
    for (const [name, group] of variants) {
      const seen = new Set();
      let current = name;
      while (current && variants.has(current) && !seen.has(current)) {
        seen.add(current);
        current = variants.get(current).parent;
      }
      if (current && seen.has(current)) {
        let member = current;
        do {
          variants.get(member).warning = "Cycle in variant parents";
          member = variants.get(member).parent;
        } while (member !== current);
      }
    }
    for (const group of variants.values()) {
      if (group.warning) group.parent = null;
      for (const d of group.drafts) {
        d.variantParent = group.parent;
        if (group.warning) d.variantWarnings.push(group.warning);
      }
    }
    const result = [];
    for (const d of drafts) {
      for (const version of d.versions) {
        result.push({
          ...d,
          version,
          parentKey: null,
          inferred: false,
          warning: "",
        });
      }
    }
    const byKey = new Map(result.map((d) => [key(d), d]));
    for (const d of result) {
      if (d.metaError) continue;
      const versionName = "v" + d.version, entries = d.meta.versions;
      if (
        Object.prototype.hasOwnProperty.call(d.meta, "versions") &&
        (!entries || typeof entries !== "object" || Array.isArray(entries))
      ) {
        d.warning = "Invalid version metadata";
        continue;
      }
      const hasEntry = !!entries &&
          Object.prototype.hasOwnProperty.call(entries, versionName),
        entry = hasEntry ? entries[versionName] : undefined;
      let parent, hasExplicit = false;
      if (hasEntry) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          d.warning = "Invalid version metadata";
          continue;
        }
        if (Object.prototype.hasOwnProperty.call(entry, "parent")) {
          hasExplicit = true;
          parent = entry.parent;
        } else continue;
      }
      if (hasExplicit) {
        if (
          !parent || typeof parent !== "object" || Array.isArray(parent) ||
          !valid(parent.draft) || !Number.isSafeInteger(parent.version) ||
          parent.version < 0
        ) {
          d.warning = "Invalid parent reference";
          continue;
        }
        const parentKey = d.target + "/" + parent.draft + "/v" + parent.version;
        if (!byKey.has(parentKey)) {
          d.warning = "Missing parent: " + parentKey;
          continue;
        }
        d.parentKey = parentKey;
      } else {
        const index = d.versions.indexOf(d.version);
        if (index > 0) {
          d.parentKey = d.target + "/" + d.id + "/v" + d.versions[index - 1];
          d.inferred = true;
        } else if (Object.prototype.hasOwnProperty.call(d.meta, "parent")) {
          const legacy = d.meta.parent;
          if (legacy === null) continue;
          if (!valid(legacy)) {
            d.warning = "Invalid legacy parent reference";
            continue;
          }
          const source = drafts.find((p) =>
            p.target === d.target && p.id === legacy
          );
          if (!source) {
            d.warning = "Missing parent draft: " + legacy;
            continue;
          }
          if (source.versions.length !== 1) {
            d.warning = "Ambiguous legacy parent: " + legacy +
              " has multiple versions";
            continue;
          }
          d.parentKey = d.target + "/" + legacy + "/v" + source.versions[0];
        } else if (d.meta.status !== "baseline") {
          d.warning = "Missing parent reference";
        }
      }
    }
    const done = new Set();
    for (const start of result) {
      if (done.has(key(start))) continue;
      const chain = [], seen = new Map();
      let current = start;
      while (current && !done.has(key(current)) && !seen.has(key(current))) {
        seen.set(key(current), chain.length);
        chain.push(current);
        current = current.parentKey ? byKey.get(current.parentKey) : null;
      }
      if (current && seen.has(key(current))) {
        for (const member of chain.slice(seen.get(key(current)))) {
          member.warning = "Cycle in parent references";
          member.parentKey = null;
          member.inferred = false;
        }
      }
      for (const member of chain) done.add(key(member));
    }
    return result;
  }
  function src(d, v) {
    return "/d/" + encodeURIComponent(d.target) + "/" +
      encodeURIComponent(d.id) + "/v" + v + ".html?theme=" + initial.theme +
      "&refresh=" + refreshToken;
  }
  function navigate(frame, d, v) {
    const nonce = crypto.randomUUID();
    frame.dataset.nonce = nonce;
    delete frame.dataset.ready;
    frame.src = src(d, v) + "&ds_nonce=" + encodeURIComponent(nonce);
  }
  function node(tag, cls, content) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (content !== undefined) n.textContent = content;
    return n;
  }
  function button(label, fn) {
    const b = node("button", "", label);
    b.type = "button";
    b.addEventListener("click", fn);
    return b;
  }
  function transform() {
    world.style.transform = "translate(" + panX + "px," + panY + "px) scale(" +
      zoom + ")";
    el("scale").textContent = Math.round(zoom * 100) + "%";
  }
  function setSelect(frame, enabled) {
    if (frame && frame.contentWindow) {
      frame.contentWindow.postMessage(
        { type: "design-studio:select", enabled },
        "*",
      );
    }
  }
  function stopSelection() {
    setSelect(activeFrame, false);
    activeFrame = null;
  }
  function setDraft(d) {
    const next = key(d);
    if (selected !== next) el("description").value = "";
    selected = next;
  }
  full.style.width = initial.width + "px";
  full.style.height = initial.height + "px";
  function selectDraft(d, frame) {
    stopSelection();
    if (frame !== full) {
      const pos = positions.get(key(d));
      if (pos) {
        panX = 30 - pos.x * zoom;
        panY = 65 - pos.y * zoom;
        transform();
      }
    }
    setDraft(d);
    selection = null;
    activeFrame = frame;
    inspector.hidden = false;
    setSelect(frame, true);
    updateSelection();
    highlight();
    el("description").focus();
  }
  function updateSelection() {
    const d = data.find((x) => key(x) === selected);
    el("selection").textContent = selection
      ? selection.selector + (selection.text ? " · " + selection.text : "")
      : "No element selected yet. Click an element, or focus the preview and use arrow keys.";
    el("request").value = d
      ? "Please update design draft " + d.target + "/" + d.id + " (v" +
        d.version + ").\n" + (selection
          ? "Selected element: " + selection.selector + "\nSelected text: " +
            selection.text + "\n"
          : "") +
        "Requested change: " + el("description").value
      : "";
  }
  function highlight() {
    for (const [k, c] of cards) c.classList.toggle("selected", k === selected);
  }
  let positions = new Map(), layoutFrame = 0;
  const edgePaths = new Map(), groupHeaders = new Map(), viewHeaders = new Map();
  function animate(element, frames, options) {
    if (
      !matchMedia("(prefers-reduced-motion: reduce)").matches && element.animate
    ) element.animate(frames, options);
  }
  const edgeKey = (d) =>
    d.parentKey ? JSON.stringify([d.parentKey, key(d)]) : "";
  const resizeObserver = new ResizeObserver(() => scheduleLayout());
  function scheduleLayout() {
    if (!layoutFrame) {
      layoutFrame = requestAnimationFrame(() => {
        layoutFrame = 0;
        layout();
      });
    }
  }
  function layout() {
    const depths = new Map(),
      byKey = new Map(data.map((d) => [key(d), d]));
    function depth(d) {
      const k = key(d);
      if (depths.has(k)) return depths.get(k);
      const parent = d.parentKey && byKey.get(d.parentKey);
      const n = parent ? depth(parent) + 1 : 0;
      depths.set(k, n);
      return n;
    }
    const groups = new Map();
    for (const d of data) {
      const groupKey = d.variant || "";
      if (!groups.has(groupKey)) groups.set(groupKey, new Map());
      const views = groups.get(groupKey);
      if (!views.has(d.target)) views.set(d.target, []);
      views.get(d.target).push(d);
    }
    const widths = new Map(), columnX = new Map();
    for (const d of data) {
      const card = cards.get(key(d));
      if (card) widths.set(depth(d), Math.max(widths.get(depth(d)) || 0, card.offsetWidth));
    }
    let nextX = 0;
    for (let col = 0; col <= Math.max(-1, ...widths.keys()); col++) {
      columnX.set(col, nextX);
      nextX += (widths.get(col) || 0) + 90;
    }
    positions = new Map();
    let groupY = 0;
    for (const [variant, views] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
      let header = groupHeaders.get(variant);
      if (!header) {
        header = node("div", "variant-header");
        nodes.append(header);
        groupHeaders.set(variant, header);
      }
      const sample = views.values().next().value[0];
      header.textContent = (variant ? "Variant: " + variant : "Unassigned variant") +
        (sample.variantParent ? " · From variant: " + sample.variantParent : "");
      header.style.left = "0px";
      header.style.top = groupY + "px";
      let y = groupY + header.offsetHeight + 24;
      for (const [view, items] of [...views].sort(([a], [b]) => a.localeCompare(b))) {
        const viewKey = JSON.stringify([variant, view]);
        let viewHeader = viewHeaders.get(viewKey);
        if (!viewHeader) {
          viewHeader = node("div", "view-header");
          nodes.append(viewHeader);
          viewHeaders.set(viewKey, viewHeader);
        }
        viewHeader.textContent = "View: " + view;
        viewHeader.style.left = "0px";
        viewHeader.style.top = y + "px";
        y += viewHeader.offsetHeight + 16;
        const columns = new Map();
        for (const d of items) {
          const col = depth(d);
          if (!columns.has(col)) columns.set(col, []);
          columns.get(col).push(d);
        }
        let viewBottom = y;
        for (const col of [...columns.keys()].sort((a, b) => a - b)) {
          const x = columnX.get(col);
          let columnY = y;
          for (const d of columns.get(col)) {
            const c = cards.get(key(d));
            if (!c) continue;
            const width = c.offsetWidth, height = c.offsetHeight;
            positions.set(key(d), { x, y: columnY, width, height });
            c.style.left = x + "px";
            c.style.top = columnY + "px";
            columnY += height + 90;
          }
          viewBottom = Math.max(viewBottom, columnY);
        }
        y = viewBottom + 40;
      }
      groupY = y + 40;
    }
    for (const [variant, header] of groupHeaders) {
      if (!groups.has(variant)) {
        header.remove();
        groupHeaders.delete(variant);
      }
    }
    for (const [viewKey, header] of viewHeaders) {
      const [variant, view] = JSON.parse(viewKey);
      if (!groups.has(variant) || !groups.get(variant).has(view)) {
        header.remove();
        viewHeaders.delete(viewKey);
      }
    }
    const wantedEdges = new Set();
    for (const d of data) {
      const pos = positions.get(key(d)), pp = positions.get(d.parentKey);
      if (pos && pp) {
        const ek = edgeKey(d);
        wantedEdges.add(ek);
        let path = edgePaths.get(ek);
        if (!path) {
          path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          edgePaths.set(ek, path);
          edges.append(path);
          if (newEdges.has(ek)) {
            animate(path, [{ opacity: 0 }, { opacity: .45 }], {
              duration: 450,
              easing: "ease-out",
            });
          }
        }
        const x1 = pp.x + pp.width,
          y1 = pp.y + pp.height / 2,
          x2 = pos.x,
          y2 = pos.y + pos.height / 2;
        const lane = (columnX.get(depth(d) - 1) + widths.get(depth(d) - 1) + x2) / 2,
          direction = Math.sign(y2 - y1),
          bend = Math.min(18, Math.abs(y2 - y1) / 2);
        path.setAttribute(
          "d",
          "M " + x1 + " " + y1 + " L " + (lane - bend) + " " + y1 +
            " Q " + lane + " " + y1 + " " + lane + " " + (y1 + direction * bend) +
            " L " + lane + " " + (y2 - direction * bend) +
            " Q " + lane + " " + y2 + " " + (lane + bend) + " " + y2 + " L " + x2 + " " + y2,
        );
        path.dataset.source = d.parentKey;
        path.dataset.target = key(d);
        path.dataset.inferred = String(d.inferred);
        if (d.inferred) path.setAttribute("stroke-dasharray", "8 5");
        else path.removeAttribute("stroke-dasharray");
      }
    }
    for (const [ek, path] of edgePaths) {
      if (!wantedEdges.has(ek)) {
        path.remove();
        edgePaths.delete(ek);
      }
    }
    newEdges.clear();
  }
  let newNodes = new Set(), newEdges = new Set();
  function render() {
    const wanted = new Set(data.map(key));
    for (const [k, c] of cards) {
      if (!wanted.has(k)) {
        if (activeFrame === c.querySelector("iframe")) stopSelection();
        if (selected === k) {
          selection = null;
          selected = null;
        }
        if (dialogKey === k && dialog.open) dialog.close();
        resizeObserver.unobserve(c);
        c.remove();
        cards.delete(k);
      }
    }
    for (let i = 0; i < data.length; i++) {
      const d = data[i], k = key(d);
      let c = cards.get(k);
      if (!c) {
        c = node("article", "node");
        c.dataset.node = k;
        const head = node("div", "node-head"), label = node("div");
        head.append(node("div", "index"));
        label.append(node("div", "node-title"), node("div", "node-sub"));
        head.append(label, node("span", "badge"));
        c.append(head);
        const frame = node("div", "frame");
        frame.style.aspectRatio = initial.width + " / " + initial.height;
        const iframe = node("iframe");
        iframe.sandbox = "allow-scripts";
        iframe.loading = "lazy";
        iframe.style.width = initial.width + "px";
        iframe.style.height = initial.height + "px";
        iframe.style.transform = "scale(" + (394 / initial.width) + ")";
        navigate(iframe, d, d.version);
        iframe.addEventListener("load", () => {
          if (activeFrame === iframe) setSelect(iframe, true);
        });
        frame.append(iframe);
        c.append(frame, node("div", "node-info"));
        const footer = node("div", "node-footer");
        footer.append(
          button("Select element", () => {
            const current = data.find((item) => key(item) === k);
            if (current) selectDraft(current, iframe);
          }),
          node("span", "spacer"),
          button("Full preview", () => {
            const current = data.find((item) => key(item) === k);
            if (!current) return;
            stopSelection();
            dialogKey = k;
            setDraft(current);
            selection = null;
            highlight();
            updateSelection();
            el("dialogTitle").textContent = title(current) + " · v" +
              current.version;
            navigate(full, current, current.version);
            dialog.querySelector(".dialog-body").append(inspector);
            inspector.hidden = true;
            activeFrame = full;
            el("dialogSelect").textContent = "Interact with preview";
            el("dialogSelect").setAttribute("aria-pressed", "true");
            dialog.showModal();
          }),
        );
        c.append(footer);
        nodes.append(c);
        cards.set(k, c);
        resizeObserver.observe(c);
        if (newNodes.has(k)) {
          animate(c, [{ opacity: 0, transform: "translateY(12px)" }, {
            opacity: 1,
            transform: "translateY(0)",
          }], { duration: 350, easing: "ease-out" });
        }
      }
      c.querySelector(".index").textContent = String(i + 1).padStart(2, "0");
      c.querySelector(".node-title").textContent = title(d);
      c.querySelector(".node-sub").textContent = "View: " + d.target + " / " + d.id +
        " / v" + d.version;
      c.querySelector("iframe").title = "Preview: " + title(d) + " v" +
        d.version;
      c.querySelector(".badge").textContent = text(d.meta.status) ||
        "candidate";
      if (dialogKey === k) {
        el("dialogTitle").textContent = title(d) + " · v" + d.version;
      }
      const info = c.querySelector(".node-info");
      info.replaceChildren();
      for (const warning of d.variantWarnings) {
        info.append(node("p", "", "Warning: " + warning));
      }
      for (
        const [prefix, value] of [
          ["", d.meta.direction],
          ["Style: ", d.meta.tokens],
          ["", d.meta.notes],
          ["Metadata error: ", d.metaError],
          ["Warning: ", d.warning],
          [
            "Parent: ",
            d.parentKey ? d.parentKey + (d.inferred ? " (inferred)" : "") : "",
          ],
        ]
      ) {
        if (typeof value === "string" && value) {
          info.append(node("p", "", prefix + value));
        }
      }
    }
    layout();
    newNodes.clear();
    el("count").textContent = String(data.length);
    el("empty").hidden = !!data.length;
    highlight();
    updateSelection();
  }
  function fit() {
    if (!data.length) return;
    layout();
    const headers = [...groupHeaders.values(), ...viewHeaders.values()];
    const boxes = [...positions.values(), ...headers.map((header) => ({
      x: header.offsetLeft, y: header.offsetTop,
      width: header.offsetWidth, height: header.offsetHeight,
    }))];
    if (!boxes.length) return;
    const minX = Math.min(...boxes.map((p) => p.x)),
      minY = Math.min(...boxes.map((p) => p.y)),
      maxX = Math.max(...boxes.map((p) => p.x + p.width)),
      maxY = Math.max(...boxes.map((p) => p.y + p.height));
    const availableWidth = Math.max(1, canvas.clientWidth - 60),
      availableHeight = Math.max(1, canvas.clientHeight - 100);
    zoom = Math.min(
      1,
      availableWidth / (maxX - minX),
      availableHeight / (maxY - minY),
    );
    panX = 30 - minX * zoom;
    panY = 65 - minY * zoom;
    transform();
  }
  function refreshPreview(frame, d, changed) {
    navigate(frame, d, d.version);
    if (changed) {
      const nonce = frame.dataset.nonce;
      frame.addEventListener("load", () => {
        if (frame.dataset.nonce === nonce) {
          animate(frame.parentElement, [{ opacity: .6 }, { opacity: 1 }], {
            duration: 400,
            easing: "ease-out",
          });
        }
      }, { once: true });
    }
  }
  let events = null;
  function refresh() {
    const id = ++requestId;
    fetch("/api/drafts", { cache: "no-store" }).then((r) => {
      if (!r.ok) throw Error("HTTP " + r.status);
      return r.json();
    }).then((result) => {
      if (id !== requestId) return;
      if (!result || !Array.isArray(result.targets)) {
        throw Error("Invalid response");
      }
      const previous = new Map(data.map((d) => [key(d), d]));
      const previousEdges = new Set(data.map(edgeKey).filter(Boolean));
      data = normalize(result.targets);
      newNodes = new Set(data.filter((d) => !previous.has(key(d))).map(key));
      newEdges = new Set(
        data.map(edgeKey).filter((k) => k && !previousEdges.has(k)),
      );
      const changed = new Set(), fingerprintChanged = new Set();
      for (const d of data) {
        const old = previous.get(key(d)),
          hash = d.versionHashes[d.version],
          oldHash = old && old.versionHashes[d.version];
        if (old && (!hash || !oldHash || hash !== oldHash)) changed.add(key(d));
        if (old && hash && oldHash && hash !== oldHash) {
          fingerprintChanged.add(key(d));
        }
      }
      if (changed.has(selected)) selection = null;
      refreshToken++;
      render();
      for (const d of data) {
        if (changed.has(key(d))) {
          const c = cards.get(key(d));
          if (c) {
            refreshPreview(
              c.querySelector("iframe"),
              d,
              fingerprintChanged.has(key(d)),
            );
          }
          if (dialog.open && dialogKey === key(d)) {
            refreshPreview(full, d, fingerprintChanged.has(key(d)));
          }
        }
      }
      if (events && events.readyState === EventSource.OPEN) {
        el("status").textContent = "Live updates connected";
      }
    }).catch(() => {
      if (id === requestId) {
        el("status").textContent = "Could not refresh drafts";
      }
    });
  }
  window.addEventListener("message", (event) => {
    if (event.origin !== "null") return;
    let frame = null, d = null;
    if (dialog.open) {
      if (event.source !== full.contentWindow) return;
      frame = full;
      d = data.find((x) => key(x) === dialogKey);
    } else {for (const item of data) {
        const c = cards.get(key(item)),
          candidate = c && c.querySelector("iframe");
        if (candidate && event.source === candidate.contentWindow) {
          frame = candidate;
          d = item;
          break;
        }
      }}
    if (!frame || !d) return;
    const msg = event.data;
    if (
      msg && msg.type === "design-studio:ready" &&
      msg.nonce === frame.dataset.nonce
    ) {
      frame.dataset.ready = msg.nonce;
      if (frame === activeFrame) setSelect(frame, true);
      return;
    }
    if (
      !msg || typeof msg !== "object" || Array.isArray(msg) ||
      msg.type !== "design-studio:selection" ||
      msg.nonce !== frame.dataset.nonce || typeof msg.selector !== "string" ||
      typeof msg.text !== "string" || !msg.selector ||
      msg.selector.length > 1000 || msg.text.length > 2000
    ) return;
    if (msg.context === true) {
      setDraft(d);
      inspector.hidden = false;
      highlight();
    } else if (frame !== activeFrame || selected !== key(d)) return;
    inspector.hidden = false;
    selection = { selector: msg.selector, text: msg.text };
    updateSelection();
  });
  // A press on a freshly loaded sandboxed frame can land on the iframe element
  // in this page instead of inside the draft, and no click follows. Forward it.
  document.addEventListener("pointerdown", (e) => {
    const frame = activeFrame;
    if (!frame || e.target !== frame || !frame.contentWindow) return;
    const r = frame.getBoundingClientRect();
    if (!r.width || !r.height) return;
    frame.contentWindow.postMessage({
      type: "design-studio:select-at",
      x: (e.clientX - r.left) * frame.offsetWidth / r.width,
      y: (e.clientY - r.top) * frame.offsetHeight / r.height,
    }, "*");
  }, true);
  el("description").addEventListener("input", updateSelection);
  el("copy").onclick = async () => {
    try {
      await navigator.clipboard.writeText(el("request").value);
      el("status").textContent = "Request copied";
    } catch {
      el("request").focus();
      el("request").select();
      el("status").textContent = "Select and copy the request manually";
    }
  };
  el("closeInspector").onclick = () => {
    stopSelection();
    inspector.hidden = true;
    if (dialog.open) {
      el("dialogSelect").textContent = "Select elements";
      el("dialogSelect").setAttribute("aria-pressed", "false");
    }
  };
  el("dialogClose").onclick = () => dialog.close();
  dialog.addEventListener("close", () => {
    // The close event is queued; a quick reopen must not be torn down by it.
    if (dialog.open) return;
    if (activeFrame === full) stopSelection();
    canvas.append(inspector);
    dialogKey = null;
    full.src = "about:blank";
  });
  full.addEventListener("load", () => {
    if (activeFrame === full) setSelect(full, true);
  });
  el("dialogSelect").onclick = () => {
    if (activeFrame === full) {
      stopSelection();
      el("dialogSelect").textContent = "Select elements";
      el("dialogSelect").setAttribute("aria-pressed", "false");
    } else {
      const d = data.find((x) => key(x) === dialogKey);
      if (d) {
        selectDraft(d, full);
        el("dialogSelect").textContent = "Interact with preview";
        el("dialogSelect").setAttribute("aria-pressed", "true");
      }
    }
  };
  canvas.addEventListener("wheel", (e) => {
    if (e.target.closest(".inspector, .controls") || !e.deltaY) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - canvas.clientLeft;
    const y = e.clientY - rect.top - canvas.clientTop;
    const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1);
    const next = Math.min(2, Math.max(Math.min(.15, zoom), zoom * Math.exp(-delta * .002)));
    panX = x - (x - panX) * next / zoom;
    panY = y - (y - panY) * next / zoom;
    zoom = next;
    transform();
  }, { passive: false });
  canvas.addEventListener("pointerdown", (e) => {
    if (
      e.target !== canvas && e.target !== world && e.target !== nodes &&
      e.target !== edges
    ) return;
    drag = { x: e.clientX, y: e.clientY, px: panX, py: panY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (drag) {
      panX = drag.px + e.clientX - drag.x;
      panY = drag.py + e.clientY - drag.y;
      transform();
    }
  });
  canvas.addEventListener("pointerup", () => drag = null);
  canvas.addEventListener("pointercancel", () => drag = null);
  el("in").onclick = () => {
    zoom = Math.min(2, zoom * 1.2);
    transform();
  };
  el("out").onclick = () => {
    zoom = zoom < .15 ? zoom / 1.2 : Math.max(.15, zoom / 1.2);
    transform();
  };
  el("left").onclick = () => {
    panX += 80;
    transform();
  };
  el("right").onclick = () => {
    panX -= 80;
    transform();
  };
  el("up").onclick = () => {
    panY += 80;
    transform();
  };
  el("down").onclick = () => {
    panY -= 80;
    transform();
  };
  el("fit").onclick = el("fitTop").onclick = fit;
  data = normalize(initial.targets);
  render();
  transform();
  if (!new URLSearchParams(location.search).has("static")) {
    events = new EventSource("/events");
    events.onopen = refresh;
    events.onmessage = refresh;
    events.onerror = () =>
      el("status").textContent = "Live updates reconnecting";
  }
})();
