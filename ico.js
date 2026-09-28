/* ico.js — чтение и запись ICO в браузере */
(function (global) {
  'use strict';

  // Парсит ICO-файл (ArrayBuffer) и возвращает первую картинку внутри.
  // Возвращает: { blob, mime, width, height } или null.
  function readIco(buffer) {
    try {
      var view = new DataView(buffer);
      // ICO header: 6 bytes
      // reserved (2) = 0, type (2) = 1, count (2)
      var reserved = view.getUint16(0, true);
      var type = view.getUint16(2, true);
      var count = view.getUint16(4, true);

      if (reserved !== 0 || type !== 1 || count < 1) return null;

      // Directory entries start at offset 6, each 16 bytes.
      var off = 6;
      var entries = [];
      for (var i = 0; i < count; i++) {
        var base = off + i * 16;
        var w = view.getUint8(base);
        var h = view.getUint8(base + 1);
        var size = view.getUint32(base + 8, true);
        var offset = view.getUint32(base + 12, true);
        entries.push({
          width: w === 0 ? 256 : w,
          height: h === 0 ? 256 : h,
          size: size,
          offset: offset
        });
      }

      // Берём самую крупную по площади
      entries.sort(function (a, b) {
        return (b.width * b.height) - (a.width * a.height);
      });

      var best = entries[0];
      var slice = buffer.slice(best.offset, best.offset + best.size);
      var bytes = new Uint8Array(slice);

      // PNG signature: 89 50 4E 47
      var isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;

      if (isPng) {
        return {
          blob: new Blob([slice], { type: 'image/png' }),
          mime: 'image/png',
          width: best.width,
          height: best.height
        };
      }

      // BMP внутри ICO — конвертируем в PNG через canvas.
      // Сложнее: у BMP внутри ICO своя структура. Для надёжности
      // соберём полноценный BMP (заголовок BITMAPINFOHEADER + маска + пиксели)
      // и прогоним через Image.
      var bmp = icoBmpToBmp(slice, best.width, best.height);
      if (bmp) {
        return { blob: new Blob([bmp], { type: 'image/bmp' }), mime: 'image/bmp', width: best.width, height: best.height };
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  // Собирает полноценный BMP из пиксельных данных, которые лежат внутри ICO.
  function icoBmpToBmp(slice, width, height) {
    try {
      var src = new DataView(slice);
      // BITMAPINFOHEADER — 40 байт
      var headerSize = src.getUint32(0, true);
      if (headerSize < 40) return null;

      var bitCount = src.getUint16(14, true);
      // В ICO высота в BITMAPINFOHEADER вдвое больше — это пиксели + маска.
      var realHeight = width; // совпадает
      // Маска идёт после палитры.
      var paletteSize = 0;
      if (bitCount <= 8) {
        paletteSize = src.getUint32(32, true);
        if (paletteSize === 0) paletteSize = Math.pow(2, bitCount);
      }
      var pixelOffset = 40 + paletteSize * 4;

      // Считаем размер данных строки, выровненный по 4 байта.
      var rowSize = Math.floor((bitCount * width + 31) / 32) * 4;
      var pixelSize = rowSize * height;

      // Полный BMP-файл: 14 (file header) + 40 (info) + palette + pixels
      var bmpSize = 14 + 40 + paletteSize * 4 + pixelSize;
      var out = new ArrayBuffer(bmpSize);
      var dv = new DataView(out);
      var u8 = new Uint8Array(out);

      // BITMAPFILEHEADER
      dv.setUint8(0, 0x42); // B
      dv.setUint8(1, 0x4D); // M
      dv.setUint32(2, bmpSize, true);
      dv.setUint16(6, 0, true);
      dv.setUint16(8, 0, true);
      dv.setUint32(10, 14 + 40 + paletteSize * 4, true);

      // BITMAPINFOHEADER — копируем 40 байт из источника
      for (var k = 0; k < 40; k++) u8[14 + k] = u8[k];

      // Исправляем высоту — в обычном BMP она положительная и равна height
      dv.setInt32(14 + 8, height, true);

      // Палитра, если есть
      if (paletteSize > 0) {
        for (var p = 0; p < paletteSize * 4; p++) {
          u8[14 + 40 + p] = u8[40 + p];
        }
      }

      // Пиксели — копируем как есть
      for (var i = 0; i < pixelSize; i++) {
        u8[14 + 40 + paletteSize * 4 + i] = u8[pixelOffset + i];
      }

      return out;
    } catch (e) {
      return null;
    }
  }

  // Записывает PNG-blob как ICO.
  // PNG уже содержит width и height, поэтому просто оборачиваем в ICO-контейнер.
  function writeIcoFromPng(pngBlob, width, height, callback) {
    var reader = new FileReader();
    reader.onload = function () {
      var pngBytes = new Uint8Array(reader.result);

      // ICO header (6) + 1 directory entry (16) + PNG data
      var headerSize = 6 + 16;
      var totalSize = headerSize + pngBytes.length;

      var out = new ArrayBuffer(totalSize);
      var dv = new DataView(out);
      var u8 = new Uint8Array(out);

      // ICONDIR
      dv.setUint16(0, 0, true);
      dv.setUint16(2, 1, true);
      dv.setUint16(4, 1, true);

      // ICONDIRENTRY
      var w = width >= 256 ? 0 : width;
      var h = height >= 256 ? 0 : height;
      dv.setUint8(6, w);
      dv.setUint8(7, h);
      dv.setUint8(8, 0); // colors
      dv.setUint8(9, 0); // reserved
      dv.setUint16(10, 1, true); // planes
      dv.setUint16(12, 32, true); // bpp
      dv.setUint32(14, pngBytes.length, true);
      dv.setUint32(18, headerSize, true);

      // PNG data
      for (var i = 0; i < pngBytes.length; i++) {
        u8[headerSize + i] = pngBytes[i];
      }

      callback(new Blob([out], { type: 'image/x-icon' }));
    };
    reader.readAsArrayBuffer(pngBlob);
  }

  // Определяет, является ли файл ICO, по сигнатуре.
  function isIco(buffer) {
    try {
      var dv = new DataView(buffer);
      if (buffer.byteLength < 6) return false;
      var reserved = dv.getUint16(0, true);
      var type = dv.getUint16(2, true);
      return reserved === 0 && type === 1;
    } catch (e) {
      return false;
    }
  }

  global.Ico = {
    readIco: readIco,
    writeIcoFromPng: writeIcoFromPng,
    isIco: isIco
  };
})(window);
