/* script.js — конвертер изображений UXNTWWW */
(function () {
  'use strict';

  var TRANSLATIONS = {};
  var currentLang = 'ru';
  var currentTheme = 'light';

  var formats = ['png', 'jpeg', 'webp', 'ico'];

  // Список файлов
  // { file, name, ext, preview, status, blob, outName }
  var items = [];

  // DOM
  var dropzone, fileInput, settings, filesEl, actionsEl, downloadEl;
  var formatGrid, qualityInput, qualityValue, widthInput, heightInput, keepRatio;
  var convertBtn, clearBtn, downloadAllBtn, preloader;
  var themeBtn, langBtn;

  // ==== Язык ====

  function detectLang() {
    var saved = localStorage.getItem('conv_lang');
    if (saved) return saved;
    var b = (navigator.language || navigator.userLanguage || 'ru').toLowerCase();
    if (b.indexOf('ru') === 0) return 'ru';
    if (b.indexOf('en') === 0) return 'en';
    return 'ru';
  }

  function loadTranslations(lang) {
    return fetch('lang.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (data) {
        TRANSLATIONS = data[lang] || data.ru || {};
      })
      .catch(function () { TRANSLATIONS = {}; });
  }

  function t(key) {
    return TRANSLATIONS[key] || key;
  }

  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.dataset.i18n;
      if (TRANSLATIONS[key]) el.textContent = TRANSLATIONS[key];
    });
    document.documentElement.lang = currentLang;
    langBtn.textContent = currentLang === 'ru' ? 'RU' : 'EN';
  }

  function setLang(lang) {
    currentLang = lang;
    localStorage.setItem('conv_lang', lang);
    loadTranslations(lang).then(applyTranslations);
  }

  // ==== Тема ====

  function detectTheme() {
    var saved = localStorage.getItem('conv_theme');
    if (saved) return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function setTheme(theme) {
    currentTheme = theme;
    document.body.classList.toggle('dark', theme === 'dark');
    themeBtn.classList.toggle('theme-dark', theme === 'dark');
    themeBtn.classList.toggle('theme-light', theme !== 'dark');
    localStorage.setItem('conv_theme', theme);
  }

  // Следим за сменой системной темы, если юзер не выбирал вручную
  function watchSystemTheme() {
    if (!window.matchMedia) return;
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var handler = function (e) {
      if (!localStorage.getItem('conv_theme')) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler);
  }

  // ==== Формат ====

  function setFormat(fmt) {
    formats.forEach(function (f) {
      document.querySelectorAll('[data-format="' + f + '"]').forEach(function (btn) {
        btn.classList.toggle('active', f === fmt);
      });
    });
    // Автообновляем расширения у всех файлов
    items.forEach(function (it) {
      it.ext = fmt;
      it.outName = it.name + '.' + extForFormat(fmt);
    });
    renderFiles();
  }

  function currentFormat() {
    var active = document.querySelector('.format-btn.active');
    return active ? active.dataset.format : 'png';
  }

  function extForFormat(fmt) {
    if (fmt === 'jpeg') return 'jpg';
    return fmt;
  }

  // ==== Загрузка файлов ====

  function addFiles(fileList) {
    var added = 0;
    Array.prototype.forEach.call(fileList, function (file) {
      if (!file.type.startsWith('image/') && !file.name.toLowerCase().endsWith('.ico')) return;
      var baseName = file.name.replace(/\.[^.]+$/, '');
      items.push({
        file: file,
        name: baseName,
        ext: currentFormat(),
        preview: URL.createObjectURL(file),
        status: null,
        blob: null,
        outName: baseName + '.' + extForFormat(currentFormat())
      });
      added++;
    });

    if (!added) return;
    settings.hidden = false;
    actionsEl.hidden = false;
    renderFiles();
  }

  // ==== Отрисовка ====

  function renderFiles() {
    filesEl.innerHTML = '';

    items.forEach(function (it, idx) {
      var card = document.createElement('div');
      card.className = 'file-card';

      var statusHtml = '';
      if (it.status === 'ok') statusHtml = '<span class="file-status ok"></span>';
      else if (it.status === 'err') statusHtml = '<span class="file-status err"></span>';

      var metaParts = [];
      metaParts.push('<span>' + formatSize(it.file.size) + '</span>');
      if (it.status === 'ok' && it.blob) {
        metaParts.push('<span>' + formatSize(it.blob.size) + '</span>');
      }

      card.innerHTML =
        '<img class="file-thumb" src="' + it.preview + '" alt="">' +
        '<div class="file-main">' +
          '<div class="file-name-row">' +
            '<input class="file-input-name" type="text" value="' + escapeAttr(it.name) + '" data-idx="' + idx + '" data-role="name">' +
            '<select class="file-input-ext" data-idx="' + idx + '" data-role="ext">' +
              formats.map(function (f) {
                var e = extForFormat(f);
                return '<option value="' + e + '"' + (e === it.ext ? ' selected' : '') + '>' + e.toUpperCase() + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<div class="file-meta">' + metaParts.join('') + '</div>' +
        '</div>' +
        '<div class="file-side">' +
          statusHtml +
          '<button class="file-remove" type="button" data-idx="' + idx + '">✕</button>' +
        '</div>';

      filesEl.appendChild(card);
    });

    // Обработчики полей
    filesEl.querySelectorAll('[data-role="name"]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var i = parseInt(inp.dataset.idx, 10);
        items[i].name = inp.value;
        items[i].outName = items[i].name + '.' + items[i].ext;
      });
    });

    filesEl.querySelectorAll('[data-role="ext"]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var i = parseInt(sel.dataset.idx, 10);
        items[i].ext = sel.value;
        items[i].outName = items[i].name + '.' + items[i].ext;
      });
    });

    filesEl.querySelectorAll('.file-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = parseInt(btn.dataset.idx, 10);
        URL.revokeObjectURL(items[i].preview);
        items.splice(i, 1);
        if (!items.length) {
          settings.hidden = true;
          actionsEl.hidden = true;
          downloadEl.hidden = true;
        }
        renderFiles();
      });
    });

    var hasReady = items.some(function (it) { return it.blob; });
    downloadEl.hidden = !hasReady;
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  // ==== Конвертация ====

function convertAll() {
  if (!items.length) return;

  var fmt = currentFormat();
  var quality = parseInt(qualityInput.value, 10) / 100;
  var w = parseInt(widthInput.value, 10) || 0;
  var h = parseInt(heightInput.value, 10) || 0;

  showPreloader(true);
  convertBtn.disabled = true;

  var tasks = items.map(function (it) {
    return convertOne(it, fmt, quality, w, h).catch(function (err) {
      console.error('Convert error:', err);
      it.status = 'err';
      it.blob = null;
    });
  });

  Promise.all(tasks).then(function () {
    showPreloader(false);
    convertBtn.disabled = false;
    renderFiles();
  }).catch(function (err) {
    console.error('All error:', err);
    showPreloader(false);
    convertBtn.disabled = false;
  });
}
    Promise.all(tasks).then(function () {
      showPreloader(false);
      convertBtn.disabled = false;
      renderFiles();
    });
  }

  function convertOne(it, fmt, quality, maxW, maxH) {
    return loadImage(it.file).then(function (img) {
      // Размеры
      var W = img.naturalWidth;
      var H = img.naturalHeight;

      if (maxW > 0 && maxH > 0) {
        W = maxW; H = maxH;
      } else if (maxW > 0) {
        W = maxW; H = Math.round(img.naturalHeight * (maxW / img.naturalWidth));
      } else if (maxH > 0) {
        H = maxH; W = Math.round(img.naturalWidth * (maxH / img.naturalHeight));
      }

      var canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      var ctx = canvas.getContext('2d');

      if (fmt === 'jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);
      }
      ctx.drawImage(img, 0, 0, W, H);

      if (fmt === 'ico') {
        // ICO пишем через PNG
        return canvasToBlob(canvas, 'image/png', 1).then(function (pngBlob) {
          return new Promise(function (resolve) {
            window.Ico.writeIcoFromPng(pngBlob, W, H, function (icoBlob) {
              it.blob = icoBlob;
              it.status = 'ok';
              resolve();
            });
          });
        });
      }

      var mime = 'image/' + fmt;
      var q = fmt === 'png' ? undefined : quality;

      return canvasToBlob(canvas, mime, q).then(function (blob) {
        if (!blob) {
          it.status = 'err';
          it.blob = null;
          return;
        }
        it.blob = blob;
        it.status = 'ok';
      });
    }).catch(function () {
      it.status = 'err';
      it.blob = null;
    });
  }

  function loadImage(file) {
    // Специальная обработка ICO: читаем через Ico.readIco
    if (file.name.toLowerCase().endsWith('.ico') || file.type === 'image/x-icon' || file.type === 'image/vnd.microsoft.icon') {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () {
          var buf = reader.result;
          if (window.Ico.isIco(buf)) {
            var parsed = window.Ico.readIco(buf);
            if (parsed) {
              var url = URL.createObjectURL(parsed.blob);
              var img = new Image();
              img.onload = function () { resolve(img); };
              img.onerror = reject;
              img.src = url;
              return;
            }
          }
          // fallback: пробуем как обычно
          var url2 = URL.createObjectURL(file);
          var img2 = new Image();
          img2.onload = function () { resolve(img2); };
          img2.onerror = reject;
          img2.src = url2;
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });
    }

    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = url;
    });
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) { resolve(blob); }, mime, quality);
    });
  }

  // ==== Скачивание ====

  function downloadAll() {
    var ready = items.filter(function (it) { return it.blob; });
    if (!ready.length) return;

    ready.forEach(function (it, i) {
      setTimeout(function () {
        var url = URL.createObjectURL(it.blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = it.outName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 800);
      }, i * 250);
    });
  }

  // ==== Прелоадер ====

  function showPreloader(on) {
    preloader.hidden = !on;
  }

  // ==== Инициализация ====

  function init() {
    dropzone = document.getElementById('dropzone');
    fileInput = document.getElementById('file-input');
    settings = document.getElementById('settings');
    filesEl = document.getElementById('files');
    actionsEl = document.getElementById('actions');
    downloadEl = document.getElementById('download');
    formatGrid = document.getElementById('format-grid');
    qualityInput = document.getElementById('quality');
    qualityValue = document.getElementById('quality-value');
    widthInput = document.getElementById('width');
    heightInput = document.getElementById('height');
    keepRatio = document.getElementById('keep-ratio');
    convertBtn = document.getElementById('convert-btn');
    clearBtn = document.getElementById('clear-btn');
    downloadAllBtn = document.getElementById('download-all');
    preloader = document.getElementById('preloader');
    themeBtn = document.getElementById('theme-btn');
    langBtn = document.getElementById('lang-btn');

    // Тема и язык
    currentTheme = detectTheme();
    setTheme(currentTheme);
    watchSystemTheme();

    currentLang = detectLang();
    loadTranslations(currentLang).then(applyTranslations);

    // Кнопки темы и языка
    themeBtn.addEventListener('click', function () {
      setTheme(currentTheme === 'dark' ? 'light' : 'dark');
    });
    langBtn.addEventListener('click', function () {
      setLang(currentLang === 'ru' ? 'en' : 'ru');
    });

    // Drag & drop
    dropzone.addEventListener('click', function () { fileInput.click(); });
    dropzone.addEventListener('dragover', function (e) {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', function () {
      dropzone.classList.remove('dragover');
    });
    dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', function () {
      addFiles(fileInput.files);
      fileInput.value = '';
    });

    // Формат
    formatGrid.querySelectorAll('.format-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setFormat(btn.dataset.format);
      });
    });

    // Качество
    qualityInput.addEventListener('input', function () {
      qualityValue.textContent = qualityInput.value;
    });

    // Пропорции
    function applyRatio(source) {
      if (!keepRatio.checked) return;
      var w = parseInt(widthInput.value, 10);
      var h = parseInt(heightInput.value, 10);

      if (source === 'width' && w > 0 && items.length) {
        loadImage(items[0].file).then(function (img) {
          heightInput.value = Math.round(w * (img.naturalHeight / img.naturalWidth));
        });
      } else if (source === 'height' && h > 0 && items.length) {
        loadImage(items[0].file).then(function (img) {
          widthInput.value = Math.round(h * (img.naturalWidth / img.naturalHeight));
        });
      }
    }
    widthInput.addEventListener('input', function () { applyRatio('width'); });
    heightInput.addEventListener('input', function () { applyRatio('height'); });

    // Действия
    convertBtn.addEventListener('click', function () {
      if (!items.length) {
        convertBtn.classList.add('shake');
        setTimeout(function () { convertBtn.classList.remove('shake'); }, 450);
        return;
      }
      convertAll();
    });

    clearBtn.addEventListener('click', function () {
      items.forEach(function (it) { URL.revokeObjectURL(it.preview); });
      items = [];
      filesEl.innerHTML = '';
      settings.hidden = true;
      actionsEl.hidden = true;
      downloadEl.hidden = true;
      widthInput.value = '';
      heightInput.value = '';
    });

    downloadAllBtn.addEventListener('click', downloadAll);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
