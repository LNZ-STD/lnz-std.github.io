# SVG to 3D Logo — Roblox Studio plugin

Plugin untuk mengubah file **.svg** (logo, ikon, teks yang sudah jadi path) menjadi
**logo 3D** yang diberi ketebalan (extrude) langsung di Roblox Studio.

## Pasang plugin

1. Buka Roblox Studio, buka place apa saja.
2. Di **Explorer**, klik kanan **ServerStorage** → **Insert Object** → **Script**.
3. Hapus isi script, lalu tempel seluruh isi `SVGTo3D.plugin.lua`.
4. Klik kanan script tersebut → **Save as Local Plugin...** → Save.
5. Panel **SVG to 3D Logo** langsung terbuka, dan tab **Plugins** punya tombol **SVG to 3D**.
   Script di ServerStorage boleh dihapus.

**Cara lain:** di tab **Plugins**, klik **Plugins Folder**, salin file `SVGTo3D.plugin.lua`
ke folder itu, lalu tutup dan buka lagi Roblox Studio.

**Plugin tidak muncul?** Buka **View → Output**. Kalau plugin termuat, ada tulisan
`[SVG to 3D] Plugin dimuat`. Kalau ada tulisan merah, salin pesan error-nya.

## Cara pakai

1. Klik **SVG to 3D** untuk membuka panel.
2. Klik **Import file .svg...**, atau tempel kode `<svg>...</svg>` ke kotak teks.
3. Atur:
   - **Ukuran (studs)**: panjang sisi terpanjang logo.
   - **Ketebalan (studs)**: tebal extrude.
   - **Detail kurva**: makin tinggi makin halus (dan makin banyak part/segitiga).
   - **Mode**:
     - **Parts**: tiap segitiga jadi 2 `WedgePart`. Paling aman, tersimpan normal di place.
     - **Mesh**: satu `MeshPart` per bentuk lewat `EditableMesh`. Lebih ringan, tapi butuh
       dukungan EditableMesh di Studio kamu (kalau gagal, pakai mode Parts).
   - **Pakai warna dari SVG**: warna `fill` tiap bentuk dipakai sebagai warna part.
   - **Rebahkan**: logo tidur menghadap ke atas (untuk lantai/plakat).
   - **Union per bentuk**: (mode Parts) gabungkan wedge per bentuk jadi satu Union.
   - **Balik arah muka**: (mode Mesh) centang kalau mesh terlihat "bolong"/terbalik.
4. Klik **Buat Logo 3D**. Hasilnya model `SVGLogo` di depan kamera, bisa di-Undo (Ctrl+Z).

### Mau jadi 1 MeshPart permanen?

Buat dengan mode **Parts**, pilih model `SVGLogo`, klik kanan → **Export Selection...** →
simpan `.obj`. Lalu impor lagi lewat **3D Importer** (File → Import 3D). Hasilnya satu
MeshPart asli yang bisa dipakai dan dipublish seperti mesh biasa.

## Yang didukung

- `<path>` (semua perintah: M L H V C S Q T A Z, absolut & relatif)
- `<rect>` (termasuk sudut bulat `rx/ry`), `<circle>`, `<ellipse>`, `<polygon>`, `<polyline>`
- `transform` (matrix, translate, scale, rotate, skewX, skewY), termasuk di `<g>`
- Lubang (huruf O, A, B, dll.) dengan `fill-rule` `evenodd` maupun `nonzero`
- Warna `fill`: `#rgb`, `#rrggbb`, `rgb()`, dan nama warna umum

## Belum didukung

- **Stroke/garis saja** (`fill="none"`). Ubah dulu jadi path berisi: di Inkscape
  *Path → Stroke to Path*, di Illustrator *Object → Path → Outline Stroke*.
- **Teks** `<text>`. Ubah dulu jadi path (*Object to Path* / *Create Outlines*).
- Gradient, gambar (`<image>`), `<use>`, clip-path, dan mask.
- Path yang memotong dirinya sendiri bisa menghasilkan segitiga yang aneh.

## Tips

- Pakai SVG yang sederhana. Logo dari Figma/Illustrator/Inkscape biasanya langsung jalan.
- Kalau jumlah part terlalu banyak, turunkan **Detail kurva** (misalnya 6–8).
