window.__ModuleLoader__.load({
	id: "dsh-turn-rail",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		// ─────────────────────────────────────────────────────────────
		// dsh-turn-rail — 会话左侧刻度滑轨（纯客户端，零 host 依赖）
		//
		// 数据来源：只读 Web GUI 已经渲染出来的 DOM。
		//   [data-conversation-scroll]        对话滚动视口
		//   [data-chat-flow-kind="user"]      你发出的提问（真实输入）
		//   [data-chat-flow-kind="steering"]  运行中插话（同样算一次提问）
		// 不使用任何 ctx.remote / RPC，因此不会因为宿主客户端 API
		// 变更而整块不挂载（前几个第三方插件就死在这里）。
		// ─────────────────────────────────────────────────────────────

		const NS = "dsh-turn-rail";

		/** 选择器：宿主 DOM 的唯一耦合点，集中在这里。 */
		const SEL = {
			scroll: "[data-conversation-scroll]",
			user: '[data-chat-flow-kind="user"],[data-chat-flow-kind="steering"]',
			loadEarlier: '[class*="older"] button',
			modal: '[role="dialog"]',
			composer: "[data-composer-seat]",
		};

		// 尺寸常量（单位 px）
		const TICK_W = 8; // 静止刻度长度
		const TICK_HOVER_W = 20; // 悬停刻度长度
		const GRAB_W = 18; // 进度条宽度
		const RAIL_W = 34; // 整条滑轨热区宽度
		const PITCH = 10; // 刻度最小间距
		const MIN_PITCH = 4; // 刻度被压密时的下限

		const STYLE = `
		/* 只做定位与命中区，不参与 flex 布局：否则绝对定位的子刻度会
		   从父容器左上角起算，整列偏到视口顶部。尺寸与命中区都交给
		   每个刻度自己的 ::before 负责。 */
		.dshrail-root {
			position: fixed;
			z-index: 30;
			left: 0;
			top: 0;
			width: ${RAIL_W}px;
			height: 0;
			box-sizing: border-box;
			font-family: inherit;
			user-select: none;
			-webkit-user-select: none;
		}
		.dshrail-root[hidden] { display: none; }

		/* 全高容器：承载最左的滚动进度条 */
		.dshrail-progress {
			position: fixed;
			z-index: 29;
			left: 0;
			width: ${GRAB_W}px;
			pointer-events: auto;
			cursor: pointer;
			border-radius: 0 4px 4px 0;
			background: transparent;
			transition: background .15s ease;
		}
		.dshrail-progress[hidden] { display: none; }
		.dshrail-progress:hover { background: rgba(127, 127, 127, .08); }
		.dshrail-progressTrack {
			position: absolute;
			left: 3px;
			top: 6px;
			bottom: 6px;
			width: 2px;
			border-radius: 1px;
			background: rgba(127, 127, 127, .16);
		}
		.dshrail-progressThumb {
			position: absolute;
			left: 1px;
			width: 6px;
			min-height: 18px;
			border-radius: 3px;
			background: rgba(127, 127, 127, .38);
			transition: background .15s ease;
		}
		.dshrail-progress:hover .dshrail-progressThumb {
			background: var(--dsw-alias-brand-primary, #4f8cff);
		}

		/* 刻度列：绝对定位容器，顶部对齐滑轨根节点；刻度自身绝对定位。 */
		.dshrail-ticks {
			position: absolute;
			left: 5px;
			top: 0;
			display: block;
		}
		.dshrail-tick {
			position: absolute;
			left: 0;
			display: flex;
			align-items: center;
			height: 2px;
			margin-bottom: 0;
			cursor: pointer;
			pointer-events: auto;
		}
		/* 扩大命中区（视觉仍是一条细线） */
		.dshrail-tick::before {
			content: "";
			position: absolute;
			left: -4px;
			right: -10px;
			top: -4px;
			bottom: -4px;
		}
		.dshrail-tick i {
			display: block;
			width: ${TICK_W}px;
			height: 2px;
			border-radius: 1px;
			background: var(--dsw-alias-label-tertiary, #888);
			opacity: .55;
			transform-origin: left center;
			transition: width .13s ease, opacity .13s ease, background .13s ease;
		}
		.dshrail-tick:hover i {
			width: ${TICK_HOVER_W}px;
			opacity: 1;
			background: var(--dsw-alias-label-secondary, #555);
		}
		/* 阶梯：悬停刻度上下相邻两根略长，形成波浪感 */
		.dshrail-tick.l1 i { width: 14px; opacity: .8; }
		.dshrail-tick.l2 i { width: 11px; opacity: .68; }
		/* 当前阅读位置 */
		.dshrail-tick.active i {
			width: ${TICK_HOVER_W}px;
			opacity: 1;
			background: var(--dsw-alias-brand-primary, #4f8cff);
		}
		.dshrail-tick:hover i { background: var(--dsw-alias-brand-primary, #4f8cff); }

		/* 悬停卡片 */
		.dshrail-tip {
			position: fixed;
			z-index: 60;
			max-width: 340px;
			min-width: 180px;
			padding: 9px 11px;
			border-radius: 10px;
			border: 1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, .28));
			background: var(--dsw-alias-bg-layer-2, rgba(242, 243, 245, .98));
			box-shadow: 0 6px 24px rgba(0, 0, 0, .16);
			font-size: 12px;
			line-height: 1.55;
			color: var(--dsw-alias-label-primary, #222);
			pointer-events: none;
			opacity: 0;
			transform: translateX(-6px);
			transition: opacity .12s ease, transform .12s ease;
		}
		.dshrail-tip.show { opacity: 1; transform: translateX(0); }
		.dshrail-tipHead {
			display: flex;
			align-items: center;
			gap: 6px;
			margin-bottom: 3px;
			font-size: 11px;
			color: var(--dsw-alias-label-tertiary, #888);
		}
		.dshrail-badge {
			flex: none;
			border-radius: 999px;
			padding: 0 6px;
			line-height: 16px;
			font-size: 10px;
			font-weight: 600;
			background: rgba(79, 140, 255, .12);
			color: var(--dsw-alias-brand-primary, #4f8cff);
		}
		.dshrail-badge.warn { background: rgba(217, 119, 6, .14); color: #c07800; }
		.dshrail-tipText {
			display: -webkit-box;
			-webkit-line-clamp: 4;
			-webkit-box-orient: vertical;
			overflow: hidden;
			word-break: break-word;
			white-space: pre-wrap;
		}
		.dshrail-tipFoot {
			margin-top: 4px;
			font-size: 10.5px;
			color: var(--dsw-alias-label-tertiary, #999);
		}

		/* 拖拽进度时的时间气泡 */
		.dshrail-hud {
			position: fixed;
			z-index: 61;
			padding: 3px 8px;
			border-radius: 7px;
			background: var(--dsw-alias-label-primary, #222);
			color: var(--dsw-alias-bg-base, #fff);
			font-size: 11px;
			font-variant-numeric: tabular-nums;
			pointer-events: none;
			opacity: 0;
			transition: opacity .12s ease;
		}
		.dshrail-hud.show { opacity: .92; }
		`;

		/** 注入样式表（只注入一次）。 */
		function injectStyle() {
			if (document.querySelector("style[data-dsh-turn-rail]")) return;
			const tag = document.createElement("style");
			tag.dataset.dshTurnRail = "true";
			tag.textContent = STYLE;
			document.head.appendChild(tag);
		}

		function el(tag, cls, parent) {
			const node = document.createElement(tag);
			if (cls) node.className = cls;
			if (parent) parent.appendChild(node);
			return node;
		}

		function textOf(node) {
			const raw = node ? node.innerText || node.textContent || "" : "";
			return String(raw).replace(/\s+/g, " ").trim();
		}

		/** 读取当前对话视口；未在对话页时返回 null。 */
		function findScroll() {
			const all = document.querySelectorAll(SEL.scroll);
			for (const node of all) {
				if (node.querySelector(SEL.user) || node.scrollHeight > node.clientHeight) return node;
			}
			return all.length > 0 ? all[0] : null;
		}

		/**
		 * 真正在滚动的那个元素：通常是 [data-conversation-scroll]，但在某些
		 * 布局/宿主版本里滚动会落在外层容器或 document 上。跳转与进度都
		 * 以它为准，避免“刻度在动、页面没动”。
		 */
		function scrollerOf(node) {
			let cur = node;
			for (let i = 0; i < 4 && cur && cur !== document.body; i++) {
				const cs = window.getComputedStyle(cur);
				if (/(auto|scroll)/.test(cs.overflowY) && cur.scrollHeight > cur.clientHeight + 4) return cur;
				cur = cur.parentElement;
			}
			if (document.scrollingElement && document.scrollingElement.scrollHeight > window.innerHeight + 4) {
				return document.scrollingElement;
			}
			return node;
		}

		/** 顶部「加载更早」按钮：class 是构建期混淆名，只能按文案匹配。 */
		function findLoadOlderButton(scroll) {
			for (const btn of scroll.querySelectorAll("button")) {
				if (btn.disabled) continue;
				const label = (btn.textContent || "").toLowerCase();
				if (label.includes("older") || label.includes("更早")) return btn;
			}
			return null;
		}

		/**
		 * 目标消息还不在 DOM 里时，驱动宿主自己的「加载更早」分页，直到它出现。
		 *
		 * 长对话的历史是虚拟列表，只有翻到那一页，节点才存在。这里把分页
		 * 交给宿主的按钮（不自己读日志、不调接口），并给足三重保护：
		 *  · 预算 6s，避免点不到时卡住交互；
		 *  · 按钮 disabled（加载中）时只等不重复点；
		 *  · 按钮消失（hasMore=false）即认定历史到头，立即返回。
		 */
		async function driveLoadUntil(scroll, predicate) {
			const started = Date.now();
			const BUDGET = 6000;
			if (predicate()) return true;
			while (Date.now() - started < BUDGET) {
				const btn = findLoadOlderButton(scroll);
				if (btn === null) return predicate();
				btn.click();
				await new Promise((r) => window.setTimeout(r, 220));
				if (predicate()) return true;
			}
			return predicate();
		}

		/** 当前对话里的全部真实提问节点（文档顺序）。 */
		function collectTicks(scroll) {
			return Array.from(scroll.querySelectorAll(SEL.user)).filter((node) => {
				if (node.hasAttribute("hidden")) return false;
				if (node.closest("[hidden]")) return false;
				return textOf(node).length > 0;
			});
		}

		const client = {
			name: NS,

			/** 客户端不需要任何宿主服务（不写 inject，避免整块被服务缺失挡住）。 */
			apply(ctx) {
				let rail = null; // 刻度列根节点
				let progress = null; // 左侧进度条
				let tip = null; // 悬停卡片
				let hud = null; // 拖拽时间气泡
				let tickNodes = []; // 与 DOM 提问节点一一对应
				let rafPending = false;
				let hoverIndex = -1;
				let disposed = false;
				let lastLayout = { start: 0, end: 0 };

				// ── 初始化 DOM 骨架 ────────────────────────────────
				function ensureDom() {
					if (rail && rail.isConnected) return;
					rail = document.createElement("div");
					rail.className = "dshrail-root";
					const ticks = el("div", "dshrail-ticks", rail);
					rail._ticks = ticks;
					document.body.appendChild(rail);

					progress = el("div", "dshrail-progress");
					progress.hidden = true;
					el("div", "dshrail-progressTrack", progress);
					progress._thumb = el("div", "dshrail-progressThumb", progress);
					document.body.appendChild(progress);

					tip = el("div", "dshrail-tip");
					tip._head = el("div", "dshrail-tipHead", tip);
					tip._body = el("div", "dshrail-tipText", tip);
					tip._foot = el("div", "dshrail-tipFoot", tip);
					document.body.appendChild(tip);

					hud = el("div", "dshrail-hud");
					document.body.appendChild(hud);
				}

				// ── 重建刻度（仅在提问数量/身份变化时） ──────────────
				function rebuild() {
					const scroll = findScroll();
					if (!scroll) {
						hideAll();
						return;
					}
					const users = collectTicks(scroll);
					if (users.length === 0 || insideModal()) {
						hideAll();
						return;
					}
					rail.hidden = false;
					progress.hidden = false;
					const box = rail._ticks;
					// 数量与内容签名都没变时，只重排而不重建
					const sig = users.length + ":" + textOf(users[0]).slice(0, 32) + ":" + textOf(users[users.length - 1]).slice(0, 32);
					if (box._sig !== sig) {
						box._sig = sig;
						box.textContent = "";
						keysRef.current = users.map((n) => n.getAttribute("data-chat-anchor-key") || null);
						tickNodes = users.map((node, index) => {
							const row = document.createElement("div");
							row.className = "dshrail-tick";
							row.appendChild(document.createElement("i"));
							row.addEventListener("mouseenter", () => onHover(index, node));
							row.addEventListener("mouseleave", () => onLeave());
							row.addEventListener("click", () => jumpTo(index));
							box.appendChild(row);
							return row;
						});
					} else {
						tickNodes.forEach((row, i) => { users[i].__railRow = row; });
					}
					ticksRef = users;
					layout();
					syncProgress();
				}

				let ticksRef = [];
				const keysRef = { current: [] };

				function hideAll() {
					if (rail) rail.hidden = true;
					if (progress) progress.hidden = true;
					if (tip) tip.classList.remove("show");
					hoverIndex = -1;
				}

				function insideModal() {
					const dlg = document.querySelector(SEL.modal);
					return dlg !== null && dlg.offsetParent !== null;
				}

				// ── 布局：把刻度列贴到视口左侧并垂直居中 ───────────────
				function layout() {
					const scroll = findScroll();
					if (!scroll || !rail || rail.hidden) return;
					const rect = scroll.getBoundingClientRect();
					const count = tickNodes.length;
					if (count === 0) return;
					let pitch = Math.min(PITCH, count > 1 ? (rect.height * 0.62) / (count - 1) : PITCH);
					pitch = Math.max(MIN_PITCH, pitch);
					const total = pitch * (count - 1) + 2;
					tickNodes.forEach((row, i) => {
						row.style.position = "absolute";
						row.style.top = Math.round(i * pitch) + "px";
					});
					const top = Math.max(rect.top + 8, rect.top + (rect.height - total) / 2);
					rail.style.top = Math.round(top) + "px";
					rail.style.height = Math.round(total) + "px";
					// 自动让位：刻度默认贴视口左缘；若这里有内容（正文、引用条等），
					// 就往左退一点点，最多退 14px，再挤就隐藏——不遮挡文字优先。
					rail.style.left = Math.round(rect.left + 2) + "px";
					nudgeIfCovered(rect, top, total);

					const pTop = rect.top + 6;
					const pHeight = Math.max(60, rect.height - 12);
					progress.style.top = Math.round(pTop) + "px";
					progress.style.height = Math.round(pHeight) + "px";
					lastLayout = { start: pTop, end: pTop + pHeight };
				}

				/**
				 * 刻度列压到正文时向左微调；退无可退（正文贴到最左）才隐藏。
				 * 用 elementFromPoint 穿透（刻度自身 pointer-events 只在行内），
				 * 命中提问/回复节点即视为遮挡。
				 */
				function nudgeIfCovered(rect, top, total) {
					const base = rect.left + 2;
					const rows = [top + 4, top + total / 2, top + total - 4];
					for (let push = 0; push <= 14; push += 7) {
						let covered = false;
						for (const y of rows) {
							const hit = document.elementFromPoint(Math.round(base + 20 + push), Math.round(y));
							if (hit && hit.closest && hit.closest("[data-chat-flow-kind]")) { covered = true; break; }
						}
						if (!covered) {
							rail.style.left = Math.round(base - push) + "px";
							return;
						}
					}
					rail.hidden = true;
				}

				// ── 滚动进度与当前位置 ──────────────────────────────
				function syncProgress() {
					const host = findScroll();
					if (!host || !progress || progress.hidden) return;
					const scroll = scrollerOf(host);
					const max = scroll.scrollHeight - scroll.clientHeight;
					const ratio = max > 4 ? Math.min(1, Math.max(0, scroll.scrollTop / max)) : 1;
					const h = progress.clientHeight - 12;
					const thumbH = Math.max(18, h * Math.min(1, scroll.clientHeight / Math.max(1, scroll.scrollHeight)));
					const thumb = progress._thumb;
					thumb.style.height = Math.round(thumbH) + "px";
					thumb.style.top = Math.round(6 + (h - thumbH) * ratio) + "px";

					// 当前阅读位置：取视口顶部越过的那一条。用 getBoundingClientRect
					// 而不是 offsetTop，这样外层容器滚动、缩放、嵌套滚动盒都成立。
					const viewTop = scroll === document.scrollingElement ? 0 : scroll.getBoundingClientRect().top;
					let active = 0;
					for (let i = 0; i < ticksRef.length; i++) {
						const t = ticksRef[i];
						const y = t.getBoundingClientRect().bottom - viewTop;
						if (y <= 90) active = i; else break;
					}
					for (let i = 0; i < tickNodes.length; i++) {
						const on = i === active && hoverIndex !== i;
						if (tickNodes[i].classList.contains("active") !== on) tickNodes[i].classList.toggle("active", on);
					}
				}

				// ── 悬停预览 ────────────────────────────────────
				function onHover(index, node) {
					hoverIndex = index;
					for (let i = 0; i < tickNodes.length; i++) {
						tickNodes[i].classList.toggle("l1", Math.abs(i - index) === 1);
						tickNodes[i].classList.toggle("l2", Math.abs(i - index) === 2);
						if (i === index) tickNodes[i].classList.remove("active");
					}
					const body = textOf(node);
					tip._head.textContent = "";
					const badge = el("span", "dshrail-badge", tip._head);
					badge.textContent = "第 " + (index + 1) + " 轮";
					if (node.getAttribute("data-chat-flow-kind") === "steering") {
						const w = el("span", "dshrail-badge warn", tip._head);
						w.textContent = "插话";
					}
					tip._body.textContent = body.length > 420 ? body.slice(0, 420) + "…" : body;
					tip._foot.textContent = "点击跳转到这一条";

					tip.classList.add("show");
					positionTip(node);
				}

				function positionTip(node) {
					const row = tickNodes[hoverIndex];
					if (!row) return;
					const r = row.getBoundingClientRect();
					const w = tip.offsetWidth;
					const h = tip.offsetHeight;
					let left = r.right + 10;
					if (left + w > window.innerWidth - 8) left = Math.max(8, r.left - w - 10);
					let top = r.top + r.height / 2 - h / 2;
					top = Math.max(8, Math.min(window.innerHeight - h - 8, top));
					tip.style.left = Math.round(left) + "px";
					tip.style.top = Math.round(top) + "px";
					void node;
				}

				function onLeave() {
					hoverIndex = -1;
					if (tip) tip.classList.remove("show");
					if (!tickNodes.length) return;
					for (const row of tickNodes) row.classList.remove("l1", "l2");
					syncProgress();
				}

				// ── 点击跳转 ────────────────────────────────────
				/**
				 * 点击刻度：如果这一轮已经被虚拟列表卸载（长对话翻走了），
				 * 先驱动「加载更早」把它找回来，再滚过去。
				 * 用 data-chat-anchor-key 认人，不用文本——同一句话发两次也不会跳错。
				 */
				async function jumpTo(index) {
					const host = findScroll();
					if (!host) return;
					const key = keysRef.current[index];
					let node = locate(host, key, index);
					if (!node) {
						const scroll = scrollerOf(host);
						await driveLoadUntil(scroll, () => {
							node = locate(host, key, index);
							return node !== null;
						});
					}
					if (!node) return; // 历史里确实没有（或被压缩掉），宁可不跳也不跳错
					node.scrollIntoView({ behavior: "smooth", block: "start" });
					flash(node);
				}

				/** 按锚点键找节点；键不存在时退回同位置的提问节点。 */
				function locate(host, key, index) {
					if (key) {
						for (const row of host.querySelectorAll("[data-chat-flow-kind]")) {
							const attr = row.getAttribute("data-chat-anchor-key") || "";
							if (attr === key || attr.endsWith(key)) return row;
						}
					}
					const users = collectTicks(host);
					return users[index] || null;
				}

				function flash(node) {
					node.style.transition = "background-color .5s ease";
					const before = node.style.backgroundColor;
					node.style.backgroundColor = "rgba(79, 140, 255, .08)";
					window.setTimeout(() => { node.style.backgroundColor = before; }, 700);
				}

				// ── 进度条拖拽/点击滚动 ─────────────────────────────
				let dragging = false;

				function scrollFromPointer(clientY) {
					const scroll = findScroll();
					if (!scroll) return;
					const ratio = Math.min(1, Math.max(0, (clientY - lastLayout.start) / Math.max(1, lastLayout.end - lastLayout.start)));
					const max = scroll.scrollHeight - scroll.clientHeight;
					scroll.scrollTop = max * ratio;
					if (hud) {
						hud.classList.add("show");
						hud.textContent = Math.round(ratio * 100) + "%";
						hud.style.left = Math.round(progress.getBoundingClientRect().right + 8) + "px";
						hud.style.top = Math.round(clientY - 10) + "px";
					}
				}

				function onProgressDown(e) {
					dragging = true;
					progress.setPointerCapture?.(e.pointerId);
					scrollFromPointer(e.clientY);
				}

				function onProgressMove(e) {
					if (!dragging) return;
					scrollFromPointer(e.clientY);
				}

				function onProgressUp() {
					dragging = false;
					if (hud) hud.classList.remove("show");
				}

				// ── 尺寸/滚动事件（合并到一帧） ─────────────────────────
				function requestSync() {
					if (rafPending || disposed) return;
					rafPending = true;
					window.requestAnimationFrame(() => {
						rafPending = false;
						try {
							rebuild();
							if (!rail.hidden) { layout(); syncProgress(); }
						} catch (err) {
							console.warn("[dsh-turn-rail] sync failed", err);
						}
					});
				}

				// ── 挂载 ───────────────────────────────────────
				injectStyle();
				ensureDom();
				rebuild();

				for (const row of tickNodes) void row;
				const cleanups = [];
				function on(target, type, handler, options) {
					target.addEventListener(type, handler, options);
					cleanups.push(() => target.removeEventListener(type, handler, options));
				}

				on(window, "scroll", requestSync, true);
				on(window, "resize", requestSync);
				on(window, "keydown", (e) => { if (e.key === "Escape") onLeave(); });
				on(progress, "pointerdown", onProgressDown);
				on(progress, "pointermove", onProgressMove);
				on(progress, "pointerup", onProgressUp);
				on(progress, "pointercancel", onProgressUp);

				const mo = new MutationObserver(() => requestSync());
				mo.observe(document.body, { childList: true, subtree: true });
				cleanups.push(() => mo.disconnect());

				const ro = new ResizeObserver(() => requestSync());
				cleanups.push(() => ro.disconnect());
				const watchScroll = () => {
					const scroll = findScroll();
					if (scroll && !scroll.__railWatched) {
						scroll.__railWatched = true;
						try { ro.observe(scroll); } catch { /* ignore */ }
					}
				};
				watchScroll();
				cleanups.push(() => { try { ro.disconnect(); } catch { /* ignore */ } });

				const timer = window.setInterval(() => { watchScroll(); requestSync(); }, 1500);
				cleanups.push(() => window.clearInterval(timer));

				const dispose = () => {
					disposed = true;
					for (const fn of cleanups.splice(0)) { try { fn(); } catch { /* ignore */ } }
					window.clearInterval(timer);
					for (const node of [rail, progress, tip, hud]) { try { node?.remove(); } catch { /* ignore */ } }
					rail = progress = tip = hud = null;
					tickNodes = [];
				};

				if (ctx && typeof ctx.effect === "function") {
					ctx.effect(() => dispose);
				} else {
					window.addEventListener("beforeunload", dispose, { once: true });
				}

				console.log("[dsh-turn-rail] client half active");
			},
		};

		module.exports = client;
		return module.exports;
	},
});
