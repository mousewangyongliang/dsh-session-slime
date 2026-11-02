/**
 * dsh-session-slime — client half.
 *
 * Draws a small colored slime next to every conversation in the sidebar and
 * makes it act out that conversation's live status:
 *
 *   running  -> bouncy, motion lines (the session is working)
 *   approval -> wiggles with a raised arm and an alert mark (waiting on you)
 *   done     -> pops, then floats with sparkles (task finished)
 *   idle     -> sleepy, breathing slowly (nothing to do)
 *
 * The status comes straight from the sidebar's own state dot, which carries a
 * data-state attribute: "ongoing" | "warning" | "done" (no dot = idle). Purely
 * visual: the icon is a pseudo-element on the row, so React re-renders, status
 * updates and drag/hover states never clobber it.
 */
window.__ModuleLoader__.load({
	id: "dsh-session-slime",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		/** Base body colors; one is picked per session from its id hash. */
		var PALETTE = [
			"#4A7BF7", // blue
			"#2FBF5B", // green
			"#FF6B5B", // coral
			"#FFA030", // orange
			"#A55BFF", // purple
			"#FF7FB6", // pink
			"#14C4B8", // teal
			"#F5C518", // yellow
			"#FF4D6D", // rose
			"#9ACD32", // lime
			"#00B4D8", // cyan
			"#B98CF0" // violet
		];

		/** Status dot states rendered by the sidebar -> slime moods. */
		var STATE_BY_DOT = { ongoing: "running", warning: "approval", done: "done" };

		/** FNV-1a over the session id: stable color and mood variants. */
		function hash(str) {
			var h = 2166136261;
			for (var i = 0; i < str.length; i++) {
				h ^= str.charCodeAt(i);
				h = Math.imul(h, 16777619);
			}
			return h >>> 0;
		}

		function mix(hex, target, amount) {
			var a = parseInt(hex.slice(1), 16);
			var b = parseInt(target.slice(1), 16);
			var r = Math.round(((a >> 16) & 255) * (1 - amount) + ((b >> 16) & 255) * amount);
			var g = Math.round(((a >> 8) & 255) * (1 - amount) + ((b >> 8) & 255) * amount);
			var bl = Math.round((a & 255) * (1 - amount) + (b & 255) * amount);
			return "#" + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
		}

		function lighten(hex, amount) {
			return mix(hex, "#ffffff", amount);
		}

		function darken(hex, amount) {
			return mix(hex, "#151a26", amount);
		}

		/* ------------------------------------------------------------------ */
		/* Faces                                                              */
		/* ------------------------------------------------------------------ */

		function eyesOpen(stroke, fill) {
			return '<circle cx="11.9" cy="14.9" r="1.6" fill="' + fill + '"/>' +
				'<circle cx="20.1" cy="14.9" r="1.6" fill="' + fill + '"/>' +
				'<circle cx="11.3" cy="14.2" r="0.55" fill="#ffffff" opacity=".85"/>' +
				'<circle cx="19.5" cy="14.2" r="0.55" fill="#ffffff" opacity=".85"/>';
		}

		function eyesSleepy(stroke) {
			return '<path d="M10.5 15.2q1.45 1.5 2.9 0" fill="none" stroke="' + stroke + '" stroke-width="1.15" stroke-linecap="round"/>' +
				'<path d="M18.6 15.2q1.45 1.5 2.9 0" fill="none" stroke="' + stroke + '" stroke-width="1.15" stroke-linecap="round"/>';
		}

		function eyesHappy(stroke) {
			return '<path d="M10.4 15.4q1.5-1.8 3 0" fill="none" stroke="' + stroke + '" stroke-width="1.2" stroke-linecap="round"/>' +
				'<path d="M18.6 15.4q1.5-1.8 3 0" fill="none" stroke="' + stroke + '" stroke-width="1.2" stroke-linecap="round"/>';
		}

		function blush() {
			return '<ellipse cx="9.2" cy="18.5" rx="1.55" ry="0.95" fill="#FF7F9C" opacity=".36"/>' +
				'<ellipse cx="22.8" cy="18.5" rx="1.55" ry="0.95" fill="#FF7F9C" opacity=".36"/>';
		}

		var ZZZ = '<path d="M23.9 6h3.4l-3.4 3h3.4" fill="none" stroke="#8492AB" stroke-width="1.05" stroke-linejoin="round" stroke-linecap="round"/>' +
			'<path d="M28.6 2.6h2.1l-2.1 1.9h2.1" fill="none" stroke="#8492AB" stroke-width="0.75" stroke-linejoin="round" stroke-linecap="round"/>';

		var MOTION = '<path d="M2.7 13.2h2.5M2.2 17h2.9M3.2 20.7h2.3" fill="none" stroke="#95A1B6" stroke-width="1.05" stroke-linecap="round"/>' +
			'<path d="M26.1 11.2c.8.85.8 2.05 0 2.9-.8-.85-.8-2.05 0-2.9Z" fill="#7FC4FF"/>';

		var ALERT = '<path d="M26.7 5.3v3.2" fill="none" stroke="#F6A21C" stroke-width="1.75" stroke-linecap="round"/>' +
			'<circle cx="26.7" cy="10.8" r="1.05" fill="#F6A21C"/>';

		var SPARKLES = '<path d="M7.7 4.9l.85 2 2 .85-2 .85-.85 2-.85-2-2-.85 2-.85z" fill="#FFD24D" stroke="#EFAF10" stroke-width="0.5" stroke-linejoin="round"/>' +
			'<path d="M25.1 7.4l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="#FFD24D" stroke="#EFAF10" stroke-width="0.4" stroke-linejoin="round"/>';

		/** Face + props for a mood; variant (0..2) keeps idle sessions from looking identical. */
		function faceFor(state, variant, base) {
			var stroke = darken(base, 0.48);
			var ink = "#20242e";
			if (state === "running") {
				return eyesOpen(stroke, ink) +
					'<path d="M13.9 18.9q2.1 2.4 4.2 0Z" fill="#3A2330"/>' +
					'<path d="M15.2 20.4q.8.7 1.6 0" fill="none" stroke="#FF8FA8" stroke-width="0.9" stroke-linecap="round"/>' +
					MOTION + blush();
			}
			if (state === "approval") {
				return eyesOpen(stroke, ink) +
					'<ellipse cx="16" cy="19.8" rx="1.15" ry="1.5" fill="#3A2330"/>' +
					'<ellipse cx="27" cy="15.6" rx="1.75" ry="3.05" transform="rotate(-20 27 15.6)" fill="' + lighten(base, 0.18) + '" stroke="' + stroke + '" stroke-width="1"/>' +
					ALERT + blush();
			}
			if (state === "done") {
				return eyesHappy(stroke) +
					'<path d="M13.9 18.7q2.1 2.1 4.2 0" fill="none" stroke="' + stroke + '" stroke-width="1.2" stroke-linecap="round"/>' +
					SPARKLES + blush();
			}
			// idle: asleep, tiny differences per variant
			var mouth = variant === 0
				? '<path d="M15.1 19.4q.9.8 1.8 0" fill="none" stroke="' + stroke + '" stroke-width="1.05" stroke-linecap="round"/>'
				: variant === 1
					? '<ellipse cx="16" cy="19.6" rx="0.95" ry="1.15" fill="' + stroke + '" opacity=".75"/>'
					: '<path d="M14.9 19.6h2.2" fill="none" stroke="' + stroke + '" stroke-width="1.05" stroke-linecap="round"/>';
			return eyesSleepy(stroke) + mouth + ZZZ + blush();
		}

		/** Full SVG icon for one session in one mood. */
		function svgFor(sessionId, state, variant) {
			var h = hash(sessionId);
			var base = PALETTE[h % PALETTE.length];
			var body =
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
				'<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
				'<stop offset="0" stop-color="' + lighten(base, 0.34) + '"/>' +
				'<stop offset="0.58" stop-color="' + base + '"/>' +
				'<stop offset="1" stop-color="' + darken(base, 0.16) + '"/>' +
				'</linearGradient></defs>' +
				'<path d="M16 4.4c6.5 0 11 4.6 11 10.7 0 6.4-4.5 11.1-11 11.1S5 21.5 5 15.1C5 9 9.5 4.4 16 4.4Z" fill="url(#g)" stroke="' + darken(base, 0.42) + '" stroke-width="1.1"/>' +
				'<ellipse cx="11.2" cy="9.2" rx="2.5" ry="1.4" transform="rotate(-18 11.2 9.2)" fill="#ffffff" opacity=".42"/>' +
				faceFor(state, variant, base) +
				'</svg>';
			return body;
		}

		var iconCache = Object.create(null);

		function iconUri(sessionId, state, variant) {
			var key = state + "|" + variant + "|" + sessionId;
			var cached = iconCache[key];
			if (cached) return cached;
			var uri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgFor(sessionId, state, variant));
			iconCache[key] = uri;
			return uri;
		}

		/**
		 * The same icon as a CSS value. A bare data URI is not a valid background
		 * value (and its ";" makes it an invalid custom property value), so wrap it
		 * in url("...").
		 */
		function cssIcon(sessionId, state, variant) {
			return 'url("' + iconUri(sessionId, state, variant) + '")';
		}

		/* ------------------------------------------------------------------ */
		/* DOM glue                                                           */
		/* ------------------------------------------------------------------ */

		var ROW = '[data-row-key^="session:"]';
		var STYLE_ID = "dsh-session-slime-style";

		var CSS = [
			/* The slime takes the leading cell; the sidebar keeps the row's own flex order. */
			ROW + '::before{',
			'  content:"";',
			'  flex:none;',
			'  width:18px;',
			'  height:18px;',
			'  margin-right:3px;',
			'  background:var(--dsh-slime-icon,none) center/contain no-repeat;',
			'  pointer-events:none;',
			'  transform-origin:50% 92%;',
			'}',
			/* The slime takes over the leading cell, including the built-in status dot,
			   so every title starts at the same x. Only purely status/empty slots are
			   hidden, never content other plugins may render there. */
			ROW + '.dsh-slime-lead > [class*="_slot"]{display:none}',
			'@keyframes dsh-slime-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.6px)}}',
			'@keyframes dsh-slime-wiggle{0%,100%{transform:rotate(-1.5deg)}30%{transform:rotate(-8deg)}70%{transform:rotate(8deg)}}',
			'@keyframes dsh-slime-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.06,.95)}}',
			'@keyframes dsh-slime-pop{0%{transform:scale(.5)}55%{transform:scale(1.16)}100%{transform:scale(1)}}',
			'@keyframes dsh-slime-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.4px)}}',
			'@media (prefers-reduced-motion:no-preference){',
			'  ' + ROW + '[data-dsh-slime-state="running"]::before{animation:dsh-slime-bob .62s ease-in-out infinite}',
			'  ' + ROW + '[data-dsh-slime-state="approval"]::before{animation:dsh-slime-wiggle .78s ease-in-out infinite}',
			'  ' + ROW + '[data-dsh-slime-state="done"]::before{animation:dsh-slime-pop .42s ease-out,dsh-slime-float 3.4s ease-in-out .42s infinite}',
			'  ' + ROW + '[data-dsh-slime-state="idle"]::before{animation:dsh-slime-breathe 3.6s ease-in-out infinite}',
			'}'
		].join("\n");

		/** Map the sidebar's own state dot onto a slime mood. */
		function stateOf(row) {
			var dot = row.querySelector("[data-state]");
			if (!dot) return "idle";
			return STATE_BY_DOT[dot.getAttribute("data-state")] || "idle";
		}

		/**
		 * True when the leading cell holds nothing but the status dot and/or the
		 * empty slot container (the slime replaces both). Any other decoration a
		 * plugin rendered there keeps the cell visible.
		 */
		function isSlimeLead(row) {
			var children = row.children;
			for (var i = 0; i < children.length; i++) {
				var child = children[i];
				if (!/[_ -]?slot/.test(String(child.className))) continue;
				var kids = child.children;
				for (var k = 0; k < kids.length; k++) {
					if (kids[k].hasAttribute("data-slot") || kids[k].hasAttribute("data-state")) continue;
					return false;
				}
				return true;
			}
			return false;
		}

		function paintRow(row) {
			var key = row.getAttribute("data-row-key") || "";
			var sessionId = key.slice(8);
			if (!sessionId) return;
			var state = stateOf(row);
			var sig = sessionId + "|" + state;
			if (row.__dshSlimeSig === sig) return;
			row.__dshSlimeSig = sig;
			var h = hash(sessionId);
			var variant = (h >>> 9) % 3;
			row.setAttribute("data-dsh-slime-state", state);
			row.style.setProperty("--dsh-slime-icon", cssIcon(sessionId, state, variant));
			if (isSlimeLead(row)) row.classList.add("dsh-slime-lead");
			else row.classList.remove("dsh-slime-lead");
		}

		var scheduled = false;

		function paintAll() {
			scheduled = false;
			var rows = document.querySelectorAll(ROW);
			for (var i = 0; i < rows.length; i++) paintRow(rows[i]);
		}

		function schedule() {
			if (scheduled) return;
			scheduled = true;
			if (typeof requestAnimationFrame === "function") requestAnimationFrame(paintAll);
			else setTimeout(paintAll, 16);
		}

		var observer = null;

		function mount() {
			if (document.getElementById(STYLE_ID)) return;
			var style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = CSS;
			document.head.appendChild(style);
			paintAll();
			observer = new MutationObserver(schedule);
			observer.observe(document.documentElement, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ["data-state", "data-row-key"]
			});
		}

		function unmount() {
			if (observer) observer.disconnect();
			observer = null;
			var style = document.getElementById(STYLE_ID);
			if (style) style.remove();
		}

		var exportsBag = exports;
		exportsBag.apply = function apply(ctx) {
			if (typeof document === "undefined") return;
			mount();
			if (ctx && typeof ctx.on === "function") ctx.on("dispose", unmount);
		};

		/* Debug hook: inspect poses without the sidebar. */
		if (typeof window !== "undefined") {
			window.__DSH_SLIME_PREVIEW__ = {
				svgFor: svgFor,
				iconUri: iconUri,
				cssIcon: cssIcon,
				stateOf: stateOf,
				hash: hash,
				PALETTE: PALETTE,
				STATES: ["running", "approval", "done", "idle"]
			};
		}

		return module.exports;
	}
});
