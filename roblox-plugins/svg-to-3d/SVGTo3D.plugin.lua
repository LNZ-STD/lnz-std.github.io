--[[
	SVG -> 3D Logo  (Roblox Studio plugin)
	by LNZ.STD

	Import file .svg (atau tempel kode SVG), lalu plugin membuat logo 3D yang
	di-extrude (diberi ketebalan). Dua mode hasil:
	  * Parts : setiap segitiga jadi 2 WedgePart (tersimpan normal di place,
	            bisa di-Union atau di-Export Selection jadi .obj)
	  * Mesh  : satu MeshPart per bentuk lewat EditableMesh

	Cara pasang: lihat README.md di folder yang sama.
]]

--[[CORE_BEGIN]]
-- Bagian inti (tanpa API Roblox): parser SVG, triangulasi, dan extrusion.
local SvgCore = {}

local abs, sqrt, sin, cos, tan, rad, pi = math.abs, math.sqrt, math.sin, math.cos, math.tan, math.rad, math.pi
local floor, ceil, max, min, huge = math.floor, math.ceil, math.max, math.min, math.huge
local atan2 = math.atan2 or math.atan
local sub, find, gmatch, match, lower = string.sub, string.find, string.gmatch, string.match, string.lower

------------------------------------------------------------------------
-- Scanner angka (untuk path data, points, transform)
------------------------------------------------------------------------
local function newScanner(s)
	return { s = s, i = 1, n = #s }
end

local function skipSep(sc)
	local _, e = find(sc.s, "^[%s,]+", sc.i)
	if e then
		sc.i = e + 1
	end
end

local function readNumber(sc)
	skipSep(sc)
	local s, start = sc.s, sc.i
	local i = start
	local c = sub(s, i, i)
	if c == "+" or c == "-" then
		i = i + 1
	end
	local hasDigits = false
	local _, e = find(s, "^%d+", i)
	if e then
		i = e + 1
		hasDigits = true
	end
	if sub(s, i, i) == "." then
		local _, e2 = find(s, "^%d+", i + 1)
		if e2 then
			i = e2 + 1
			hasDigits = true
		elseif hasDigits then
			i = i + 1
		end
	end
	if not hasDigits then
		return nil
	end
	local ec = sub(s, i, i)
	if ec == "e" or ec == "E" then
		local _, e3 = find(s, "^[%+%-]?%d+", i + 1)
		if e3 then
			i = e3 + 1
		end
	end
	sc.i = i
	local str = sub(s, start, i - 1)
	return tonumber(str) or tonumber(str .. "0")
end

local function readFlag(sc)
	skipSep(sc)
	local c = sub(sc.s, sc.i, sc.i)
	if c == "0" or c == "1" then
		sc.i = sc.i + 1
		return c == "1"
	end
	return nil
end

local function readNumbers(s)
	local sc, out = newScanner(s), {}
	while true do
		local v = readNumber(sc)
		if v == nil then
			break
		end
		out[#out + 1] = v
	end
	return out
end

------------------------------------------------------------------------
-- Matriks 2D {a, b, c, d, e, f}:  x' = a*x + c*y + e ; y' = b*x + d*y + f
------------------------------------------------------------------------
local IDENTITY = { 1, 0, 0, 1, 0, 0 }

local function matMul(m, n)
	return {
		m[1] * n[1] + m[3] * n[2],
		m[2] * n[1] + m[4] * n[2],
		m[1] * n[3] + m[3] * n[4],
		m[2] * n[3] + m[4] * n[4],
		m[1] * n[5] + m[3] * n[6] + m[5],
		m[2] * n[5] + m[4] * n[6] + m[6],
	}
end

local function applyMat(m, x, y)
	return m[1] * x + m[3] * y + m[5], m[2] * x + m[4] * y + m[6]
end

local function parseTransform(str)
	local m = IDENTITY
	if not str then
		return m
	end
	for name, args in gmatch(str, "([%a]+)%s*%(([^%)]*)%)") do
		local v = readNumbers(args)
		local t
		name = lower(name)
		if name == "matrix" and #v >= 6 then
			t = { v[1], v[2], v[3], v[4], v[5], v[6] }
		elseif name == "translate" and #v >= 1 then
			t = { 1, 0, 0, 1, v[1], v[2] or 0 }
		elseif name == "scale" and #v >= 1 then
			t = { v[1], 0, 0, v[2] or v[1], 0, 0 }
		elseif name == "rotate" and #v >= 1 then
			local a = rad(v[1])
			t = { cos(a), sin(a), -sin(a), cos(a), 0, 0 }
			if #v >= 3 then
				t = matMul(matMul({ 1, 0, 0, 1, v[2], v[3] }, t), { 1, 0, 0, 1, -v[2], -v[3] })
			end
		elseif name == "skewx" and #v >= 1 then
			t = { 1, 0, tan(rad(v[1])), 1, 0, 0 }
		elseif name == "skewy" and #v >= 1 then
			t = { 1, tan(rad(v[1])), 0, 1, 0, 0 }
		end
		if t then
			m = matMul(m, t)
		end
	end
	return m
end

------------------------------------------------------------------------
-- Path data -> daftar subpath (poligon)
------------------------------------------------------------------------
local function arcPoints(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2, detail, emit)
	if x1 == x2 and y1 == y2 then
		return
	end
	rx, ry = abs(rx), abs(ry)
	if rx == 0 or ry == 0 then
		emit(x2, y2)
		return
	end
	local phi = rad(phiDeg)
	local cp, sp = cos(phi), sin(phi)
	local dx2, dy2 = (x1 - x2) / 2, (y1 - y2) / 2
	local x1p = cp * dx2 + sp * dy2
	local y1p = -sp * dx2 + cp * dy2
	local lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
	if lambda > 1 then
		local s = sqrt(lambda)
		rx, ry = rx * s, ry * s
	end
	local num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
	local den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
	local coef = 0
	if den ~= 0 then
		coef = sqrt(max(0, num / den))
	end
	if fa == fs then
		coef = -coef
	end
	local cxp = coef * (rx * y1p / ry)
	local cyp = coef * (-ry * x1p / rx)
	local cx = cp * cxp - sp * cyp + (x1 + x2) / 2
	local cy = sp * cxp + cp * cyp + (y1 + y2) / 2
	local ux, uy = (x1p - cxp) / rx, (y1p - cyp) / ry
	local vx, vy = (-x1p - cxp) / rx, (-y1p - cyp) / ry
	local theta1 = atan2(uy, ux)
	local dtheta = atan2(ux * vy - uy * vx, ux * vx + uy * vy)
	if not fs and dtheta > 0 then
		dtheta = dtheta - 2 * pi
	elseif fs and dtheta < 0 then
		dtheta = dtheta + 2 * pi
	end
	local n = max(2, ceil(abs(dtheta) / (2 * pi) * detail * 4))
	for i = 1, n - 1 do
		local t = theta1 + dtheta * i / n
		local ex, ey = rx * cos(t), ry * sin(t)
		emit(cp * ex - sp * ey + cx, sp * ex + cp * ey + cy)
	end
	emit(x2, y2)
end

local function parsePathData(d, detail)
	local sc = newScanner(d)
	local subpaths = {}
	local cur = nil
	local x, y, sx, sy = 0, 0, 0, 0
	local lastCmd = nil
	local prevType = nil -- "C" / "Q" / nil, untuk perintah S dan T
	local lcx, lcy = 0, 0

	local function startSub(px, py)
		cur = { { px, py } }
		subpaths[#subpaths + 1] = cur
	end
	local function lineTo(px, py)
		if not cur then
			startSub(x, y)
		end
		cur[#cur + 1] = { px, py }
	end

	while true do
		skipSep(sc)
		if sc.i > sc.n then
			break
		end
		local c = sub(sc.s, sc.i, sc.i)
		local cmd
		if find(c, "^[MmLlHhVvCcSsQqTtAaZz]$") then
			cmd = c
			sc.i = sc.i + 1
		else
			if not lastCmd or lastCmd == "Z" or lastCmd == "z" then
				break
			end
			cmd = lastCmd
			if cmd == "M" then
				cmd = "L"
			elseif cmd == "m" then
				cmd = "l"
			end
		end
		local rel = (cmd == lower(cmd)) and cmd ~= "z"
		local up = string.upper(cmd)
		local ox, oy = 0, 0
		if rel then
			ox, oy = x, y
		end
		local ok = true

		if up == "M" then
			local a, b = readNumber(sc), readNumber(sc)
			if not b then
				break
			end
			x, y = a + ox, b + oy
			sx, sy = x, y
			startSub(x, y)
			prevType = nil
		elseif up == "L" then
			local a, b = readNumber(sc), readNumber(sc)
			if not b then
				break
			end
			x, y = a + ox, b + oy
			lineTo(x, y)
			prevType = nil
		elseif up == "H" then
			local a = readNumber(sc)
			if not a then
				break
			end
			x = a + ox
			lineTo(x, y)
			prevType = nil
		elseif up == "V" then
			local a = readNumber(sc)
			if not a then
				break
			end
			y = a + oy
			lineTo(x, y)
			prevType = nil
		elseif up == "C" or up == "S" then
			local x1, y1, x2, y2, ex, ey
			if up == "C" then
				x1, y1 = readNumber(sc), readNumber(sc)
			end
			x2, y2 = readNumber(sc), readNumber(sc)
			ex, ey = readNumber(sc), readNumber(sc)
			if not ey or (up == "C" and not y1) then
				break
			end
			if up == "C" then
				x1, y1 = x1 + ox, y1 + oy
			elseif prevType == "C" then
				x1, y1 = 2 * x - lcx, 2 * y - lcy
			else
				x1, y1 = x, y
			end
			x2, y2, ex, ey = x2 + ox, y2 + oy, ex + ox, ey + oy
			local x0, y0 = x, y
			for i = 1, detail do
				local t = i / detail
				local mt = 1 - t
				local a, b, cc, dd = mt * mt * mt, 3 * mt * mt * t, 3 * mt * t * t, t * t * t
				lineTo(a * x0 + b * x1 + cc * x2 + dd * ex, a * y0 + b * y1 + cc * y2 + dd * ey)
			end
			x, y, lcx, lcy = ex, ey, x2, y2
			prevType = "C"
		elseif up == "Q" or up == "T" then
			local x1, y1, ex, ey
			if up == "Q" then
				x1, y1 = readNumber(sc), readNumber(sc)
			end
			ex, ey = readNumber(sc), readNumber(sc)
			if not ey or (up == "Q" and not y1) then
				break
			end
			if up == "Q" then
				x1, y1 = x1 + ox, y1 + oy
			elseif prevType == "Q" then
				x1, y1 = 2 * x - lcx, 2 * y - lcy
			else
				x1, y1 = x, y
			end
			ex, ey = ex + ox, ey + oy
			local x0, y0 = x, y
			for i = 1, detail do
				local t = i / detail
				local mt = 1 - t
				lineTo(mt * mt * x0 + 2 * mt * t * x1 + t * t * ex, mt * mt * y0 + 2 * mt * t * y1 + t * t * ey)
			end
			x, y, lcx, lcy = ex, ey, x1, y1
			prevType = "Q"
		elseif up == "A" then
			local arx, ary, rot = readNumber(sc), readNumber(sc), readNumber(sc)
			local fa, fs = readFlag(sc), readFlag(sc)
			local ex, ey = readNumber(sc), readNumber(sc)
			if not ey or fa == nil or fs == nil then
				break
			end
			ex, ey = ex + ox, ey + oy
			arcPoints(x, y, arx, ary, rot, fa, fs, ex, ey, detail, lineTo)
			x, y = ex, ey
			prevType = nil
		elseif up == "Z" then
			x, y = sx, sy
			cur = nil
			prevType = nil
		else
			ok = false
		end
		if not ok then
			break
		end
		lastCmd = cmd
	end
	return subpaths
end

------------------------------------------------------------------------
-- Elemen SVG -> path data
------------------------------------------------------------------------
local function num(v, default)
	if v == nil then
		return default
	end
	local n = tonumber(match(v, "^%s*([%+%-]?[%d%.]+[eE]?[%+%-]?%d*)"))
	return n or default
end

local function fmt(...)
	local parts = {}
	for i, v in ipairs({ ... }) do
		parts[i] = tostring(v)
	end
	return table.concat(parts, " ")
end

local function elementToPath(name, a)
	if name == "path" then
		return a.d
	elseif name == "rect" then
		local x, y = num(a.x, 0), num(a.y, 0)
		local w, h = num(a.width, 0), num(a.height, 0)
		if w <= 0 or h <= 0 then
			return nil
		end
		local rx, ry = num(a.rx, nil), num(a.ry, nil)
		rx = rx or ry or 0
		ry = ry or rx
		rx, ry = min(rx, w / 2), min(ry, h / 2)
		if rx <= 0 or ry <= 0 then
			return fmt("M", x, y, "H", x + w, "V", y + h, "H", x, "Z")
		end
		return fmt(
			"M", x + rx, y, "H", x + w - rx,
			"A", rx, ry, 0, 0, 1, x + w, y + ry, "V", y + h - ry,
			"A", rx, ry, 0, 0, 1, x + w - rx, y + h, "H", x + rx,
			"A", rx, ry, 0, 0, 1, x, y + h - ry, "V", y + ry,
			"A", rx, ry, 0, 0, 1, x + rx, y, "Z"
		)
	elseif name == "circle" or name == "ellipse" then
		local cx, cy = num(a.cx, 0), num(a.cy, 0)
		local rx, ry
		if name == "circle" then
			rx = num(a.r, 0)
			ry = rx
		else
			rx, ry = num(a.rx, 0), num(a.ry, 0)
		end
		if rx <= 0 or ry <= 0 then
			return nil
		end
		return fmt(
			"M", cx - rx, cy,
			"A", rx, ry, 0, 1, 0, cx + rx, cy,
			"A", rx, ry, 0, 1, 0, cx - rx, cy, "Z"
		)
	elseif name == "polygon" or name == "polyline" then
		if not a.points or a.points == "" then
			return nil
		end
		return "M " .. a.points .. " Z"
	end
	return nil
end

------------------------------------------------------------------------
-- Warna
------------------------------------------------------------------------
local NAMED_COLORS = {
	black = { 0, 0, 0 }, white = { 255, 255, 255 }, red = { 255, 0, 0 }, lime = { 0, 255, 0 },
	green = { 0, 128, 0 }, blue = { 0, 0, 255 }, yellow = { 255, 255, 0 }, cyan = { 0, 255, 255 },
	aqua = { 0, 255, 255 }, magenta = { 255, 0, 255 }, fuchsia = { 255, 0, 255 }, gray = { 128, 128, 128 },
	grey = { 128, 128, 128 }, silver = { 192, 192, 192 }, maroon = { 128, 0, 0 }, olive = { 128, 128, 0 },
	navy = { 0, 0, 128 }, purple = { 128, 0, 128 }, teal = { 0, 128, 128 }, orange = { 255, 165, 0 },
	pink = { 255, 192, 203 }, gold = { 255, 215, 0 }, brown = { 165, 42, 42 }, currentcolor = { 0, 0, 0 },
}

local function parseColor(s)
	if not s then
		return nil
	end
	s = lower(match(s, "^%s*(.-)%s*$"))
	local hex = match(s, "^#(%x+)$")
	if hex then
		if #hex == 3 or #hex == 4 then
			local r, g, b = sub(hex, 1, 1), sub(hex, 2, 2), sub(hex, 3, 3)
			return { tonumber(r .. r, 16), tonumber(g .. g, 16), tonumber(b .. b, 16) }
		elseif #hex == 6 or #hex == 8 then
			return { tonumber(sub(hex, 1, 2), 16), tonumber(sub(hex, 3, 4), 16), tonumber(sub(hex, 5, 6), 16) }
		end
		return nil
	end
	local args = match(s, "^rgba?%((.-)%)$")
	if args then
		local out = {}
		for part in gmatch(args, "[^,%s/]+") do
			local n = tonumber(match(part, "^[%d%.]+"))
			if n and find(part, "%%") then
				n = n * 2.55
			end
			out[#out + 1] = n
		end
		if out[1] and out[2] and out[3] then
			return { min(255, floor(out[1] + 0.5)), min(255, floor(out[2] + 0.5)), min(255, floor(out[3] + 0.5)) }
		end
		return nil
	end
	return NAMED_COLORS[s]
end

------------------------------------------------------------------------
-- XML sederhana: ambil elemen bentuk + transform + fill yang diwariskan
------------------------------------------------------------------------
local SKIP_ELEMENTS = {
	defs = true, clippath = true, mask = true, symbol = true, pattern = true, marker = true,
	lineargradient = true, radialgradient = true, style = true, title = true, desc = true,
	metadata = true, script = true, filter = true, text = true,
}
local SHAPE_ELEMENTS = { path = true, rect = true, circle = true, ellipse = true, polygon = true, polyline = true }

local function parseAttrs(body)
	local attrs = {}
	for k, _, v in gmatch(body, "([%w_:%-%.]+)%s*=%s*([\"'])(.-)%2") do
		attrs[lower(k)] = v
	end
	if attrs.style then
		for k, v in gmatch(attrs.style, "([%w%-]+)%s*:%s*([^;]+)") do
			attrs[lower(k)] = match(v, "^%s*(.-)%s*$")
		end
	end
	return attrs
end

local function parseSvgElements(svg)
	svg = string.gsub(svg, "<!%-%-.-%-%->", "")
	svg = string.gsub(svg, "<!%[CDATA%[.-%]%]>", "")
	local root = { transform = IDENTITY, fill = "#000000", fillRule = "nonzero", skip = false }
	local stack = { root }
	local elements = {}
	for body in gmatch(svg, "<([^>]*)>") do
		local first = sub(body, 1, 1)
		if first == "/" then
			if #stack > 1 then
				stack[#stack] = nil
			end
		elseif first ~= "?" and first ~= "!" then
			local name = match(body, "^%s*([%w:_%-]+)")
			if name then
				name = lower(match(name, "([%w_%-]+)$"))
				local selfClosing = find(body, "/%s*$") ~= nil
				local attrs = parseAttrs(body)
				local parent = stack[#stack]
				local ctx = {
					transform = parent.transform,
					fill = attrs.fill or parent.fill,
					fillRule = attrs["fill-rule"] or parent.fillRule,
					skip = parent.skip or SKIP_ELEMENTS[name] == true
						or attrs.display == "none" or attrs.visibility == "hidden",
				}
				if attrs.transform then
					ctx.transform = matMul(parent.transform, parseTransform(attrs.transform))
				end
				if not ctx.skip and SHAPE_ELEMENTS[name] and lower(ctx.fill) ~= "none" then
					local d = elementToPath(name, attrs)
					if d then
						elements[#elements + 1] = {
							d = d,
							transform = ctx.transform,
							fill = ctx.fill,
							fillRule = lower(ctx.fillRule),
						}
					end
				end
				if not selfClosing then
					stack[#stack + 1] = ctx
				end
			end
		end
	end
	return elements
end

------------------------------------------------------------------------
-- Geometri poligon
------------------------------------------------------------------------
local function polyArea(pts)
	local s, n = 0, #pts
	for i = 1, n do
		local p, q = pts[i], pts[i % n + 1]
		s = s + p[1] * q[2] - q[1] * p[2]
	end
	return s / 2
end

local function pointInPoly(x, y, pts)
	local inside, n = false, #pts
	local j = n
	for i = 1, n do
		local xi, yi, xj, yj = pts[i][1], pts[i][2], pts[j][1], pts[j][2]
		if (yi > y) ~= (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi then
			inside = not inside
		end
		j = i
	end
	return inside
end

local function cleanContour(pts, eps)
	local out = {}
	for _, p in ipairs(pts) do
		local last = out[#out]
		if not last or abs(last[1] - p[1]) > eps or abs(last[2] - p[2]) > eps then
			out[#out + 1] = p
		end
	end
	while #out > 1 and abs(out[1][1] - out[#out][1]) <= eps and abs(out[1][2] - out[#out][2]) <= eps do
		out[#out] = nil
	end
	-- buang titik yang segaris dengan tetangganya, supaya muka depan dan
	-- dinding samping memakai titik yang sama (tanpa celah T-junction)
	local changed = true
	while changed and #out > 3 do
		changed = false
		local i = 1
		while i <= #out and #out > 3 do
			local n = #out
			local a, p, b = out[(i - 2) % n + 1], out[i], out[i % n + 1]
			local cross = (p[1] - a[1]) * (b[2] - p[2]) - (p[2] - a[2]) * (b[1] - p[1])
			local dot = (p[1] - a[1]) * (b[1] - p[1]) + (p[2] - a[2]) * (b[2] - p[2])
			if abs(cross) <= eps * eps and dot >= 0 then
				table.remove(out, i)
				changed = true
			else
				i = i + 1
			end
		end
	end
	return out
end

local function oriented(pts, ccw)
	if (polyArea(pts) > 0) == ccw then
		return pts
	end
	local r = {}
	for i = #pts, 1, -1 do
		r[#r + 1] = pts[i]
	end
	return r
end

------------------------------------------------------------------------
-- Triangulasi: port dari algoritma earcut (Mapbox, ISC license)
------------------------------------------------------------------------
local earcutLinked

local function insertNode(i, x, y, last)
	local p = { i = i, x = x, y = y, steiner = false }
	if not last then
		p.prev, p.next = p, p
	else
		p.next = last.next
		p.prev = last
		last.next.prev = p
		last.next = p
	end
	return p
end

local function removeNode(p)
	p.next.prev = p.prev
	p.prev.next = p.next
end

local function area(p, q, r)
	return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y)
end

local function equals(a, b)
	return a.x == b.x and a.y == b.y
end

local function signedArea(pts, s, e)
	local sum, j = 0, e
	for i = s, e do
		sum = sum + (pts[j][1] - pts[i][1]) * (pts[i][2] + pts[j][2])
		j = i
	end
	return sum
end

local function linkedList(pts, s, e, clockwise)
	local last
	if clockwise == (signedArea(pts, s, e) > 0) then
		for i = s, e do
			last = insertNode(i, pts[i][1], pts[i][2], last)
		end
	else
		for i = e, s, -1 do
			last = insertNode(i, pts[i][1], pts[i][2], last)
		end
	end
	if last and equals(last, last.next) then
		removeNode(last)
		last = last.next
	end
	return last
end

local function filterPoints(start, e)
	if not start then
		return start
	end
	e = e or start
	local p = start
	repeat
		local again = false
		if not p.steiner and (equals(p, p.next) or area(p.prev, p, p.next) == 0) then
			removeNode(p)
			p = p.prev
			e = p
			if p == p.next then
				break
			end
			again = true
		else
			p = p.next
		end
	until not (again or p ~= e)
	return e
end

local function pointInTriangle(ax, ay, bx, by, cx, cy, px, py)
	return (cx - px) * (ay - py) >= (ax - px) * (cy - py)
		and (ax - px) * (by - py) >= (bx - px) * (ay - py)
		and (bx - px) * (cy - py) >= (cx - px) * (by - py)
end

local function isEar(ear)
	local a, b, c = ear.prev, ear, ear.next
	if area(a, b, c) >= 0 then
		return false
	end
	local x0, y0 = min(a.x, b.x, c.x), min(a.y, b.y, c.y)
	local x1, y1 = max(a.x, b.x, c.x), max(a.y, b.y, c.y)
	local p = c.next
	while p ~= a do
		if p.x >= x0 and p.x <= x1 and p.y >= y0 and p.y <= y1
			and pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y)
			and area(p.prev, p, p.next) >= 0 then
			return false
		end
		p = p.next
	end
	return true
end

local function sign(v)
	if v > 0 then
		return 1
	elseif v < 0 then
		return -1
	end
	return 0
end

local function onSegment(p, q, r)
	return q.x <= max(p.x, r.x) and q.x >= min(p.x, r.x) and q.y <= max(p.y, r.y) and q.y >= min(p.y, r.y)
end

local function intersects(p1, q1, p2, q2)
	local o1, o2 = sign(area(p1, q1, p2)), sign(area(p1, q1, q2))
	local o3, o4 = sign(area(p2, q2, p1)), sign(area(p2, q2, q1))
	if o1 ~= o2 and o3 ~= o4 then
		return true
	end
	if o1 == 0 and onSegment(p1, p2, q1) then
		return true
	end
	if o2 == 0 and onSegment(p1, q2, q1) then
		return true
	end
	if o3 == 0 and onSegment(p2, p1, q2) then
		return true
	end
	if o4 == 0 and onSegment(p2, q1, q2) then
		return true
	end
	return false
end

local function locallyInside(a, b)
	if area(a.prev, a, a.next) < 0 then
		return area(a, b, a.next) >= 0 and area(a, a.prev, b) >= 0
	end
	return area(a, b, a.prev) < 0 or area(a, a.next, b) < 0
end

local function intersectsPolygon(a, b)
	local p = a
	repeat
		if p.i ~= a.i and p.next.i ~= a.i and p.i ~= b.i and p.next.i ~= b.i and intersects(p, p.next, a, b) then
			return true
		end
		p = p.next
	until p == a
	return false
end

local function middleInside(a, b)
	local p, inside = a, false
	local px, py = (a.x + b.x) / 2, (a.y + b.y) / 2
	repeat
		if ((p.y > py) ~= (p.next.y > py)) and p.next.y ~= p.y
			and px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x then
			inside = not inside
		end
		p = p.next
	until p == a
	return inside
end

local function isValidDiagonal(a, b)
	if a.next.i == b.i or a.prev.i == b.i or intersectsPolygon(a, b) then
		return false
	end
	if locallyInside(a, b) and locallyInside(b, a) and middleInside(a, b)
		and (area(a.prev, a, b.prev) ~= 0 or area(a, b.prev, b) ~= 0) then
		return true
	end
	return equals(a, b) and area(a.prev, a, a.next) > 0 and area(b.prev, b, b.next) > 0
end

local function splitPolygon(a, b)
	local a2 = { i = a.i, x = a.x, y = a.y, steiner = false }
	local b2 = { i = b.i, x = b.x, y = b.y, steiner = false }
	local an, bp = a.next, b.prev
	a.next = b
	b.prev = a
	a2.next = an
	an.prev = a2
	b2.next = a2
	a2.prev = b2
	bp.next = b2
	b2.prev = bp
	return b2
end

local function cureLocalIntersections(start, tris)
	local p = start
	repeat
		local a, b = p.prev, p.next.next
		if not equals(a, b) and intersects(a, p, p.next, b) and locallyInside(a, b) and locallyInside(b, a) then
			tris[#tris + 1] = { a.i, p.i, b.i }
			removeNode(p)
			removeNode(p.next)
			p = b
			start = b
		end
		p = p.next
	until p == start
	return filterPoints(p)
end

local function splitEarcut(start, tris)
	local a = start
	repeat
		local b = a.next.next
		while b ~= a.prev do
			if a.i ~= b.i and isValidDiagonal(a, b) then
				local c = splitPolygon(a, b)
				a = filterPoints(a, a.next)
				c = filterPoints(c, c.next)
				earcutLinked(a, tris, 0)
				earcutLinked(c, tris, 0)
				return
			end
			b = b.next
		end
		a = a.next
	until a == start
end

earcutLinked = function(ear, tris, pass)
	if not ear then
		return
	end
	local stop = ear
	while ear.prev ~= ear.next do
		local prev, nxt = ear.prev, ear.next
		if isEar(ear) then
			tris[#tris + 1] = { prev.i, ear.i, nxt.i }
			removeNode(ear)
			ear = nxt.next
			stop = nxt.next
		else
			ear = nxt
			if ear == stop then
				if pass == 0 then
					earcutLinked(filterPoints(ear), tris, 1)
				elseif pass == 1 then
					earcutLinked(cureLocalIntersections(filterPoints(ear), tris), tris, 2)
				else
					splitEarcut(ear, tris)
				end
				break
			end
		end
	end
end

local function getLeftmost(start)
	local p, leftmost = start, start
	repeat
		if p.x < leftmost.x or (p.x == leftmost.x and p.y < leftmost.y) then
			leftmost = p
		end
		p = p.next
	until p == start
	return leftmost
end

local function sectorContainsSector(m, p)
	return area(m.prev, m, p.prev) < 0 and area(p.next, m, m.next) < 0
end

local function findHoleBridge(hole, outerNode)
	local p = outerNode
	local hx, hy = hole.x, hole.y
	local qx = -huge
	local m
	repeat
		if hy <= p.y and hy >= p.next.y and p.next.y ~= p.y then
			local x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y)
			if x <= hx and x > qx then
				qx = x
				m = (p.x < p.next.x) and p or p.next
				if x == hx then
					return m
				end
			end
		end
		p = p.next
	until p == outerNode
	if not m then
		return nil
	end
	local stop = m
	local mx, my = m.x, m.y
	local tanMin = huge
	p = m
	repeat
		if hx >= p.x and p.x >= mx and hx ~= p.x then
			local inTri
			if hy < my then
				inTri = pointInTriangle(hx, hy, mx, my, qx, hy, p.x, p.y)
			else
				inTri = pointInTriangle(qx, hy, mx, my, hx, hy, p.x, p.y)
			end
			if inTri then
				local t = abs(hy - p.y) / (hx - p.x)
				if locallyInside(p, hole)
					and (t < tanMin or (t == tanMin and (p.x > m.x or (p.x == m.x and sectorContainsSector(m, p))))) then
					m = p
					tanMin = t
				end
			end
		end
		p = p.next
	until p == stop
	return m
end

local function eliminateHole(hole, outerNode)
	local bridge = findHoleBridge(hole, outerNode)
	if not bridge then
		return outerNode
	end
	local bridgeReverse = splitPolygon(bridge, hole)
	filterPoints(bridgeReverse, bridgeReverse.next)
	return filterPoints(bridge, bridge.next)
end

-- pts: array {x, y}; outer = 1..outerEnd; holeRanges = { {start, end}, ... }
function SvgCore.earcut(pts, outerEnd, holeRanges)
	local tris = {}
	local outerNode = linkedList(pts, 1, outerEnd, true)
	if not outerNode or outerNode.next == outerNode.prev then
		return tris
	end
	if #holeRanges > 0 then
		local queue = {}
		for _, r in ipairs(holeRanges) do
			local list = linkedList(pts, r[1], r[2], false)
			if list then
				if list == list.next then
					list.steiner = true
				end
				queue[#queue + 1] = getLeftmost(list)
			end
		end
		table.sort(queue, function(a, b)
			return a.x < b.x
		end)
		for _, h in ipairs(queue) do
			outerNode = eliminateHole(h, outerNode)
		end
	end
	earcutLinked(outerNode, tris, 0)
	return tris
end

------------------------------------------------------------------------
-- Kelompokkan kontur jadi bentuk luar + lubang, lalu triangulasi
------------------------------------------------------------------------
local function groupContours(contours, fillRule, minArea)
	local items = {}
	for _, c in ipairs(contours) do
		local a = polyArea(c)
		if abs(a) > minArea then
			items[#items + 1] = { pts = c, area = abs(a), ccw = a > 0 }
		end
	end
	table.sort(items, function(a, b)
		return a.area > b.area
	end)

	local polys = {}
	for i, it in ipairs(items) do
		local n = #it.pts
		local samples = { it.pts[1], it.pts[floor(n / 3) + 1], it.pts[floor(2 * n / 3) + 1] }
		for j = i - 1, 1, -1 do
			local cand, votes = items[j], 0
			for _, s in ipairs(samples) do
				if pointInPoly(s[1], s[2], cand.pts) then
					votes = votes + 1
				end
			end
			if votes >= 2 then
				it.parent = cand
				break
			end
		end
		local parent = it.parent
		if not parent or not parent.solid then
			it.solid = true
			it.poly = { outer = it.pts, holes = {} }
			polys[#polys + 1] = it.poly
		elseif fillRule == "evenodd" or it.ccw ~= parent.ccw then
			it.solid = false
			parent.poly.holes[#parent.poly.holes + 1] = it.pts
		else
			-- nonzero, arah sama dengan induknya: area ini sudah terisi
			it.solid = true
			it.poly = parent.poly
		end
	end
	return polys
end

local function triangulatePoly(poly, minArea)
	local outer = oriented(poly.outer, true)
	local verts = {}
	for _, p in ipairs(outer) do
		verts[#verts + 1] = p
	end
	local outerEnd = #verts
	local ranges, holes = {}, {}
	for _, h in ipairs(poly.holes) do
		local hh = oriented(h, false)
		holes[#holes + 1] = hh
		local s = #verts + 1
		for _, p in ipairs(hh) do
			verts[#verts + 1] = p
		end
		ranges[#ranges + 1] = { s, #verts }
	end
	local raw = SvgCore.earcut(verts, outerEnd, ranges)
	local tris = {}
	for _, t in ipairs(raw) do
		local a, b, c = verts[t[1]], verts[t[2]], verts[t[3]]
		local cross = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1])
		if abs(cross) > minArea then
			if cross > 0 then
				tris[#tris + 1] = { t[1], t[2], t[3] }
			else
				tris[#tris + 1] = { t[1], t[3], t[2] }
			end
		end
	end
	return { outer = outer, holes = holes, verts = verts, tris = tris }
end

------------------------------------------------------------------------
-- API utama
------------------------------------------------------------------------
-- opts.size   : ukuran sisi terpanjang hasil (studs)
-- opts.detail : jumlah segmen per kurva
-- Hasil: koordinat 2D sudah diskalakan, di tengah (0,0), sumbu Y ke atas.
function SvgCore.process(svgText, opts)
	opts = opts or {}
	local detail = max(1, floor(opts.detail or 12))
	local size = opts.size or 20

	local elements = parseSvgElements(svgText)
	local raw = {}
	local minX, minY, maxX, maxY = huge, huge, -huge, -huge
	for _, el in ipairs(elements) do
		local contours = {}
		for _, sp in ipairs(parsePathData(el.d, detail)) do
			local pts = {}
			for _, p in ipairs(sp) do
				local x, y = applyMat(el.transform, p[1], p[2])
				pts[#pts + 1] = { x, y }
			end
			pts = cleanContour(pts, 0)
			if #pts >= 3 then
				contours[#contours + 1] = pts
				for _, p in ipairs(pts) do
					minX, maxX = min(minX, p[1]), max(maxX, p[1])
					minY, maxY = min(minY, p[2]), max(maxY, p[2])
				end
			end
		end
		if #contours > 0 then
			local color = parseColor(el.fill)
			raw[#raw + 1] = { contours = contours, color = color, fillRule = el.fillRule }
		end
	end
	if #raw == 0 then
		error("Tidak ada bentuk berisi (fill) di SVG ini. Garis/stroke saja belum didukung, ubah dulu jadi path (Object to Path / Outline Stroke).", 0)
	end

	local w, h = maxX - minX, maxY - minY
	local scale = size / max(w, h, 1e-9)
	local cx, cy = (minX + maxX) / 2, (minY + maxY) / 2
	local eps = size * 1e-6
	local minArea = size * size * 1e-10

	local shapes, triCount = {}, 0
	for _, r in ipairs(raw) do
		local contours = {}
		for _, c in ipairs(r.contours) do
			local pts = {}
			for _, p in ipairs(c) do
				pts[#pts + 1] = { (p[1] - cx) * scale, -(p[2] - cy) * scale }
			end
			pts = cleanContour(pts, eps)
			if #pts >= 3 then
				contours[#contours + 1] = pts
			end
		end
		local polys = {}
		for _, poly in ipairs(groupContours(contours, r.fillRule, minArea)) do
			local tp = triangulatePoly(poly, minArea)
			if #tp.tris > 0 then
				polys[#polys + 1] = tp
				triCount = triCount + #tp.tris
			end
		end
		if #polys > 0 then
			shapes[#shapes + 1] = { color = r.color, polys = polys }
		end
	end
	return { shapes = shapes, width = w * scale, height = h * scale, triangles = triCount }
end

-- Mesh tertutup (depan, belakang, dinding samping) dari satu poligon hasil process.
-- Logo menghadap +Z, tebal dari -depth/2 sampai +depth/2. Segitiga berlawanan arah jarum jam (CCW).
function SvgCore.extrude(poly, depth)
	local verts, tris = {}, {}
	local hz = depth / 2
	for _, p in ipairs(poly.verts) do
		verts[#verts + 1] = { p[1], p[2], hz }
	end
	for _, t in ipairs(poly.tris) do
		tris[#tris + 1] = { t[1], t[2], t[3] }
	end
	local off = #verts
	for _, p in ipairs(poly.verts) do
		verts[#verts + 1] = { p[1], p[2], -hz }
	end
	for _, t in ipairs(poly.tris) do
		tris[#tris + 1] = { off + t[1], off + t[3], off + t[2] }
	end
	local function wall(p, q)
		local b = #verts
		verts[b + 1] = { p[1], p[2], -hz }
		verts[b + 2] = { q[1], q[2], -hz }
		verts[b + 3] = { q[1], q[2], hz }
		verts[b + 4] = { p[1], p[2], hz }
		tris[#tris + 1] = { b + 1, b + 2, b + 3 }
		tris[#tris + 1] = { b + 1, b + 3, b + 4 }
	end
	-- Dinding dibangun dari tepi triangulasi (sisi yang hanya dipakai satu segitiga),
	-- jadi depan, belakang, dan samping selalu menyambung rapat.
	local function key(p)
		return string.format("%.6f,%.6f", p[1], p[2])
	end
	local used = {}
	for _, t in ipairs(poly.tris) do
		for k = 1, 3 do
			local a, b = poly.verts[t[k]], poly.verts[t[k % 3 + 1]]
			local e = key(a) .. "|" .. key(b)
			used[e] = (used[e] or 0) + 1
		end
	end
	for _, t in ipairs(poly.tris) do
		for k = 1, 3 do
			local a, b = poly.verts[t[k]], poly.verts[t[k % 3 + 1]]
			if not used[key(b) .. "|" .. key(a)] then
				wall(a, b)
			end
		end
	end
	return verts, tris
end

SvgCore._parsePathData = parsePathData
SvgCore._polyArea = polyArea
--[[CORE_END]]

------------------------------------------------------------------------
-- Bagian plugin (Roblox Studio)
------------------------------------------------------------------------
if not plugin then
	return SvgCore
end

local ChangeHistoryService = game:GetService("ChangeHistoryService")
local StudioService = game:GetService("StudioService")
local AssetService = game:GetService("AssetService")
local GeometryService = game:GetService("GeometryService")
local Selection = game:GetService("Selection")

local DEFAULT_COLOR = Color3.fromRGB(163, 162, 165)

local toolbar = plugin:CreateToolbar("LNZ.STD")
local toggleButton = toolbar:CreateButton("SVGTo3D", "Import SVG dan buat logo 3D", "", "SVG to 3D")
toggleButton.ClickableWhenViewportHidden = true

local widget = plugin:CreateDockWidgetPluginGui(
	"LNZ_SVGTo3D",
	DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Float, true, false, 320, 560, 260, 360)
)
widget.Title = "SVG to 3D Logo"
widget.Name = "SVGTo3D"

toggleButton.Click:Connect(function()
	widget.Enabled = not widget.Enabled
end)
widget:GetPropertyChangedSignal("Enabled"):Connect(function()
	toggleButton:SetActive(widget.Enabled)
end)

-- ===== UI =====
local theme = settings().Studio.Theme
local function themeColor(name)
	return theme:GetColor(Enum.StudioStyleGuideColor[name])
end

local root = Instance.new("ScrollingFrame")
root.Size = UDim2.fromScale(1, 1)
root.CanvasSize = UDim2.new()
root.AutomaticCanvasSize = Enum.AutomaticSize.Y
root.ScrollBarThickness = 6
root.BorderSizePixel = 0
root.BackgroundColor3 = themeColor("MainBackground")
root.Parent = widget

local padding = Instance.new("UIPadding")
padding.PaddingTop = UDim.new(0, 10)
padding.PaddingBottom = UDim.new(0, 10)
padding.PaddingLeft = UDim.new(0, 10)
padding.PaddingRight = UDim.new(0, 14)
padding.Parent = root

local layout = Instance.new("UIListLayout")
layout.Padding = UDim.new(0, 6)
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Parent = root

local order = 0
local function place(gui)
	order += 1
	gui.LayoutOrder = order
	gui.Parent = root
	return gui
end

local function corner(gui)
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, 4)
	c.Parent = gui
end

local function makeLabel(text, height, bold)
	local l = Instance.new("TextLabel")
	l.Size = UDim2.new(1, 0, 0, height or 18)
	l.BackgroundTransparency = 1
	l.Font = bold and Enum.Font.SourceSansBold or Enum.Font.SourceSans
	l.TextSize = bold and 16 or 14
	l.TextColor3 = themeColor(bold and "BrightText" or "MainText")
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.TextYAlignment = Enum.TextYAlignment.Top
	l.TextWrapped = true
	l.Text = text
	return place(l)
end

local function makeButton(text, primary)
	local b = Instance.new("TextButton")
	b.Size = UDim2.new(1, 0, 0, 28)
	b.BackgroundColor3 = themeColor(primary and "DialogMainButton" or "Button")
	b.TextColor3 = themeColor(primary and "DialogMainButtonText" or "ButtonText")
	b.BorderSizePixel = 0
	b.Font = primary and Enum.Font.SourceSansBold or Enum.Font.SourceSans
	b.TextSize = 15
	b.Text = text
	b.AutoButtonColor = true
	corner(b)
	return place(b)
end

local function makeInput(caption, default)
	local row = Instance.new("Frame")
	row.Size = UDim2.new(1, 0, 0, 24)
	row.BackgroundTransparency = 1
	local l = Instance.new("TextLabel")
	l.Size = UDim2.new(0.6, -4, 1, 0)
	l.BackgroundTransparency = 1
	l.Font = Enum.Font.SourceSans
	l.TextSize = 14
	l.TextColor3 = themeColor("MainText")
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.Text = caption
	l.Parent = row
	local box = Instance.new("TextBox")
	box.Size = UDim2.new(0.4, 0, 1, 0)
	box.Position = UDim2.new(0.6, 0, 0, 0)
	box.BackgroundColor3 = themeColor("InputFieldBackground")
	box.BorderColor3 = themeColor("InputFieldBorder")
	box.TextColor3 = themeColor("MainText")
	box.Font = Enum.Font.SourceSans
	box.TextSize = 14
	box.ClearTextOnFocus = false
	box.Text = tostring(plugin:GetSetting("svg3d_" .. caption) or default)
	box.FocusLost:Connect(function()
		plugin:SetSetting("svg3d_" .. caption, box.Text)
	end)
	box.Parent = row
	place(row)
	return box
end

local function makeToggle(caption, default)
	local saved = plugin:GetSetting("svg3d_" .. caption)
	local state = default
	if saved ~= nil then
		state = saved
	end
	local b = Instance.new("TextButton")
	b.Size = UDim2.new(1, 0, 0, 22)
	b.BackgroundTransparency = 1
	b.Font = Enum.Font.SourceSans
	b.TextSize = 14
	b.TextColor3 = themeColor("MainText")
	b.TextXAlignment = Enum.TextXAlignment.Left
	local function refresh()
		b.Text = (state and "[x]  " or "[  ]  ") .. caption
	end
	refresh()
	b.MouseButton1Click:Connect(function()
		state = not state
		plugin:SetSetting("svg3d_" .. caption, state)
		refresh()
	end)
	place(b)
	return function()
		return state
	end
end

local function makeChoice(caption, options, default)
	local saved = plugin:GetSetting("svg3d_" .. caption)
	local index = table.find(options, saved) or default
	local b = makeButton("", false)
	local function refresh()
		b.Text = caption .. ": " .. options[index]
	end
	refresh()
	b.MouseButton1Click:Connect(function()
		index = index % #options + 1
		plugin:SetSetting("svg3d_" .. caption, options[index])
		refresh()
	end)
	return function()
		return options[index]
	end
end

makeLabel("SVG to 3D Logo", 20, true)
makeLabel("1. Pilih file .svg atau tempel kode SVG.\n2. Atur ukuran & ketebalan.\n3. Klik Buat Logo 3D.", 50)

local importButton = makeButton("Import file .svg...", false)
local fileLabel = makeLabel("Belum ada file.", 18)

local pasteBox = Instance.new("TextBox")
pasteBox.Size = UDim2.new(1, 0, 0, 70)
pasteBox.BackgroundColor3 = themeColor("InputFieldBackground")
pasteBox.BorderColor3 = themeColor("InputFieldBorder")
pasteBox.TextColor3 = themeColor("MainText")
pasteBox.PlaceholderText = "...atau tempel kode <svg> di sini"
pasteBox.PlaceholderColor3 = themeColor("DimmedText")
pasteBox.Font = Enum.Font.Code
pasteBox.TextSize = 12
pasteBox.MultiLine = true
pasteBox.ClearTextOnFocus = false
pasteBox.TextWrapped = true
pasteBox.TextXAlignment = Enum.TextXAlignment.Left
pasteBox.TextYAlignment = Enum.TextYAlignment.Top
pasteBox.ClipsDescendants = true
pasteBox.Text = ""
place(pasteBox)

makeLabel("Pengaturan", 20, true)
local sizeBox = makeInput("Ukuran (studs)", 20)
local depthBox = makeInput("Ketebalan (studs)", 2)
local detailBox = makeInput("Detail kurva (2-64)", 12)
local getMode = makeChoice("Mode", { "Parts", "Mesh" }, 1)
local getUseColors = makeToggle("Pakai warna dari SVG", true)
local getLayFlat = makeToggle("Rebahkan (menghadap ke atas)", false)
local getUnion = makeToggle("Union per bentuk (mode Parts)", false)
local getFlip = makeToggle("Balik arah muka (mode Mesh)", false)

local generateButton = makeButton("Buat Logo 3D", true)
local statusLabel = makeLabel("", 20)
statusLabel.AutomaticSize = Enum.AutomaticSize.Y

-- ===== State =====
local loadedSvg = nil
local busy = false

local function setStatus(text, isError)
	statusLabel.Text = text
	statusLabel.TextColor3 = isError and themeColor("ErrorText") or themeColor("MainText")
end

importButton.MouseButton1Click:Connect(function()
	local ok, file = pcall(function()
		return StudioService:PromptImportFile({ "svg" })
	end)
	if not ok then
		setStatus("Gagal membuka file: " .. tostring(file), true)
		return
	end
	if not file then
		return
	end
	loadedSvg = file:GetBinaryContents()
	fileLabel.Text = "File: " .. file.Name .. " (" .. math.floor(#loadedSvg / 1024 + 0.5) .. " KB)"
	pasteBox.Text = ""
	setStatus("File siap. Klik Buat Logo 3D.")
end)

pasteBox.FocusLost:Connect(function()
	if pasteBox.Text ~= "" then
		loadedSvg = nil
		fileLabel.Text = "Memakai kode SVG yang ditempel."
	end
end)

-- ===== Builder: Parts =====
local wedgeTemplate = Instance.new("WedgePart")
wedgeTemplate.Anchored = true
wedgeTemplate.Material = Enum.Material.SmoothPlastic
wedgeTemplate.TopSurface = Enum.SurfaceType.Smooth
wedgeTemplate.BottomSurface = Enum.SurfaceType.Smooth

-- Segitiga a,b,c (Vector3) menjadi prisma setebal `thickness` dari 2 WedgePart.
local function drawTriangle(a, b, c, thickness, color, parent)
	local ab, ac, bc = b - a, c - a, c - b
	local abd, acd, bcd = ab:Dot(ab), ac:Dot(ac), bc:Dot(bc)
	if abd > acd and abd > bcd then
		c, a = a, c
	elseif acd > bcd and acd > abd then
		a, b = b, a
	end
	ab, ac, bc = b - a, c - a, c - b
	local normal = ac:Cross(ab)
	if normal.Magnitude < 1e-9 then
		return 0
	end
	local right = normal.Unit
	local up = bc:Cross(right).Unit
	local back = bc.Unit
	local height = math.abs(ab:Dot(up))

	local w1 = wedgeTemplate:Clone()
	w1.Size = Vector3.new(thickness, height, math.abs(ab:Dot(back)))
	w1.CFrame = CFrame.fromMatrix((a + b) / 2, right, up, back)
	w1.Color = color
	w1.Parent = parent

	local w2 = wedgeTemplate:Clone()
	w2.Size = Vector3.new(thickness, height, math.abs(ac:Dot(back)))
	w2.CFrame = CFrame.fromMatrix((a + c) / 2, -right, up, -back)
	w2.Color = color
	w2.Parent = parent
	return 2
end

local function tryUnion(container)
	local parts = container:GetChildren()
	if #parts < 2 then
		return false
	end
	local first = table.remove(parts, 1)
	local ok, result = pcall(function()
		return GeometryService:UnionAsync(first, parts, { SplitApart = false })
	end)
	if not ok or not result or not result[1] then
		return false
	end
	local union = result[1]
	union.Anchored = true
	union.UsePartColor = true
	union.Color = first.Color
	first:Destroy()
	for _, p in parts do
		p:Destroy()
	end
	union.Parent = container
	return true
end

local function buildParts(shape, index, base, depth, color, union)
	local container = Instance.new("Model")
	container.Name = "Shape" .. index
	local count = 0
	for _, poly in shape.polys do
		local v = poly.verts
		for _, t in poly.tris do
			local a = base:PointToWorldSpace(Vector3.new(v[t[1]][1], v[t[1]][2], 0))
			local b = base:PointToWorldSpace(Vector3.new(v[t[2]][1], v[t[2]][2], 0))
			local c = base:PointToWorldSpace(Vector3.new(v[t[3]][1], v[t[3]][2], 0))
			count += drawTriangle(a, b, c, depth, color, container)
			if count % 600 == 0 then
				task.wait()
			end
		end
	end
	local unioned = union and tryUnion(container)
	return container, count, unioned
end

-- ===== Builder: Mesh =====
local function buildMesh(shape, index, base, depth, color, flip)
	local verts, tris = {}, {}
	for _, poly in shape.polys do
		local pv, pt = SvgCore.extrude(poly, depth)
		local off = #verts
		for _, p in pv do
			verts[#verts + 1] = p
		end
		for _, t in pt do
			tris[#tris + 1] = { off + t[1], off + t[2], off + t[3] }
		end
	end
	local minX, minY, maxX, maxY = math.huge, math.huge, -math.huge, -math.huge
	for _, p in verts do
		minX, maxX = math.min(minX, p[1]), math.max(maxX, p[1])
		minY, maxY = math.min(minY, p[2]), math.max(maxY, p[2])
	end
	local cx, cy = (minX + maxX) / 2, (minY + maxY) / 2

	local em = AssetService:CreateEditableMesh()
	local ids = table.create(#verts)
	for i, p in verts do
		ids[i] = em:AddVertex(Vector3.new(p[1] - cx, p[2] - cy, p[3]))
	end
	for _, t in tris do
		if flip then
			em:AddTriangle(ids[t[1]], ids[t[3]], ids[t[2]])
		else
			em:AddTriangle(ids[t[1]], ids[t[2]], ids[t[3]])
		end
	end
	local meshPart = AssetService:CreateMeshPartAsync(Content.fromObject(em))
	meshPart.Name = "Shape" .. index
	meshPart.Anchored = true
	meshPart.Material = Enum.Material.SmoothPlastic
	meshPart.Color = color
	meshPart.CFrame = base * CFrame.new(cx, cy, 0)
	return meshPart, #tris
end

-- ===== Generate =====
local function placementCFrame(size, layFlat)
	local cam = workspace.CurrentCamera
	local look = cam.CFrame.LookVector
	local flat = Vector3.new(look.X, 0, look.Z)
	if flat.Magnitude < 1e-3 then
		flat = Vector3.new(0, 0, -1)
	end
	local pos = cam.CFrame.Position + look * (size * 1.2 + 10)
	-- +Z lokal (muka depan logo) menghadap ke kamera
	local base = CFrame.lookAt(pos, pos + flat.Unit)
	if layFlat then
		base *= CFrame.Angles(-math.pi / 2, 0, 0)
	end
	return base
end

local function generate()
	if busy then
		return
	end
	local svg = loadedSvg or pasteBox.Text
	if not svg or not string.find(svg, "<svg") then
		setStatus("Pilih file .svg atau tempel kode SVG dulu.", true)
		return
	end
	local size = math.clamp(tonumber(sizeBox.Text) or 20, 0.1, 2048)
	local depth = math.clamp(tonumber(depthBox.Text) or 2, 0.01, 512)
	local detail = math.clamp(math.floor(tonumber(detailBox.Text) or 12), 2, 64)
	local mode = getMode()

	busy = true
	setStatus("Memproses SVG...")
	local ok, result = pcall(SvgCore.process, svg, { size = size, detail = detail })
	if not ok then
		busy = false
		setStatus("Gagal membaca SVG: " .. tostring(result), true)
		return
	end

	local recording = ChangeHistoryService:TryBeginRecording("SVG to 3D Logo")
	local model = Instance.new("Model")
	model.Name = "SVGLogo"
	local base = placementCFrame(size, getLayFlat())
	local total, failures, unionFails = 0, 0, 0
	local lastError = nil

	for i, shape in result.shapes do
		local color = DEFAULT_COLOR
		if getUseColors() and shape.color then
			color = Color3.fromRGB(shape.color[1], shape.color[2], shape.color[3])
		end
		setStatus(string.format("Membuat bentuk %d / %d...", i, #result.shapes))
		if mode == "Mesh" then
			local okMesh, part, n = pcall(buildMesh, shape, i, base, depth, color, getFlip())
			if okMesh then
				part.Parent = model
				total += n
			else
				failures += 1
				lastError = part
			end
		else
			local container, n, unioned = buildParts(shape, i, base, depth, color, getUnion())
			container.Parent = model
			total += n
			if getUnion() and not unioned then
				unionFails += 1
			end
		end
	end

	model.WorldPivot = base
	model.Parent = workspace
	Selection:Set({ model })
	if recording then
		ChangeHistoryService:FinishRecording(recording, Enum.FinishRecordingOperation.Commit)
	end
	busy = false

	local summary = string.format(
		"Selesai! %d bentuk, %.1f x %.1f studs, tebal %.2f.\n%s: %d.",
		#result.shapes, result.width, result.height, depth,
		mode == "Mesh" and "Segitiga mesh" or "WedgePart", total
	)
	if failures > 0 then
		summary ..= string.format(
			"\n%d bentuk gagal dibuat sebagai mesh: %s\nCoba mode Parts.",
			failures, tostring(lastError)
		)
	end
	if unionFails > 0 then
		summary ..= string.format("\n%d bentuk tidak bisa di-Union (dibiarkan sebagai parts).", unionFails)
	end
	setStatus(summary, failures > 0)
end

generateButton.MouseButton1Click:Connect(generate)

toggleButton:SetActive(widget.Enabled)
print("[SVG to 3D] Plugin dimuat. Buka lewat tab Plugins -> SVG to 3D.")
