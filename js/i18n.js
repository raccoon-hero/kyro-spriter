/* Kyro's Spriter — UI strings (English default, Ukrainian). */
'use strict';

const I18N = (() => {
  const en = {
    // Top bar
    open: 'Open', open_title: 'Open image (Ctrl+O)',
    mode_aria: 'Cut mode',
    mode_scan: 'Scan', mode_scan_title: 'Find sprites automatically by transparency',
    mode_grid: 'Grid', mode_grid_title: 'Cut into an even grid',
    detect: 'Detect', detect_title: 'Detect sprites again',
    undo_title: 'Undo (Ctrl+Z)', redo_title: 'Redo (Ctrl+Shift+Z)',
    lang_title: 'Language',

    // Tools
    tools_aria: 'Tools',
    tool_select: 'Select / edit (V)',
    tool_rect: 'Rectangle cut (R)',
    tool_poly: 'Polygon cut (P) — click points, Enter to finish',
    tool_lasso: 'Freehand lasso cut (L)',
    tool_wand: 'Magic eraser (W) — click a background patch to remove it',
    tool_pick: 'Pick background color (I)',
    tool_pan: 'Pan (H) — or hold Space / middle mouse',
    help_title: 'Shortcuts (?)',
    hint_select: 'Click a sprite to select · Shift+click to add · drag empty space to box-select · drag a hand-drawn shape to move it',
    hint_rect: 'Drag to cut a rectangle · hold Shift to add to the selected sprite, Alt to cut away from it',
    hint_poly: 'Click to place points · Enter, double-click or click the first point to finish · Backspace removes the last point',
    hint_lasso: 'Drag around the shape and release · hold Shift to add, Alt to cut away',
    hint_wand: 'Click a leftover background patch to erase it (uses the Tolerance slider)',
    hint_pick: 'Click the background to sample its color',
    hint_pan: 'Drag to move around · scroll to zoom',

    // Background
    sec_bg: 'Background removal',
    color: 'Color', pick_title: 'Pick from image (I)',
    auto: 'Auto', auto_title: 'Guess from the image border',
    tolerance: 'Tolerance',
    tolerance_title: "How different from the background color a pixel must be to stay. Auto-set from the image's noise when you load it.",
    denoise: 'Noise reduction',
    denoise_title: 'Averages out compression noise before deciding what is background — keeps borders that are only a shade off the background',
    smooth: 'Smooth outline',
    smooth_title: 'Straightens jagged, noisy borders into a clean anti-aliased edge',
    softness: 'Edge softness', softness_note: '(smooth off)',
    softness_title: 'Color-based edge fade. Only used when Smooth outline is off — good for pixel art / game sprites.',
    bg_mode: 'Remove', bg_mode_edges: 'Background touching edges', bg_mode_global: 'Every matching pixel',
    ring: 'Restore border ring',
    ring_title: 'Restores a ring of original pixels around each sprite — rescue for borders that are exactly the background color',
    defringe: 'Clean color halo on edges',
    remove_bg: 'Remove background',
    reset: 'Reset', reset_title: 'Restore the original image',
    bg_hint: 'Sliders update live after removing. Use the <b>magic eraser (W)</b> on leftover patches, like gaps between arms.',

    // Detection
    sec_detect: 'Detection',
    gap: 'Merge gap',
    split: 'Separate touching',
    split_title: 'Splits sprites that touch through a thin neck (e.g. stickers whose borders touch). Higher = cuts thicker connections.',
    alpha: 'Alpha threshold',
    specks: 'Ignore specks under',
    absorb: 'Keep inner bits with their sprite',

    // Grid
    sec_grid: 'Grid', by_count: 'By count', by_size: 'By cell size',
    cols: 'Columns', rows: 'Rows', cell_w: 'Cell W', cell_h: 'Cell H',
    off_x: 'Offset X', off_y: 'Offset Y', sp_x: 'Spacing X', sp_y: 'Spacing Y',
    skip_empty: 'Skip empty cells',

    // Manual
    sec_manual: 'Manual cuts',
    carve: 'Manual shapes take pixels from auto sprites',
    tip1: '<kbd>R</kbd> <kbd>P</kbd> <kbd>L</kbd> draw a new sprite shape',
    tip2: 'Hold <kbd>Shift</kbd> while finishing to <b>add</b> to the selected sprite',
    tip3: 'Hold <kbd>Alt</kbd> while finishing to <b>cut away</b> from it',
    tip4: 'Select a shape to drag its points; double-click an edge to add a point, right-click a point to remove it',

    // Filter
    sec_filter: 'Size filter', min_w: 'Min W', min_h: 'Min H', max_w: 'Max W', max_h: 'Max H',

    // Export
    sec_export: 'Export', format: 'Format', name: 'Name',
    trim: 'Trim transparent edges',
    pixel: 'Pixel-art scaling (sharp pixels)',
    json: 'Add positions JSON to ZIP',
    regular: 'Regular download', scale: 'Scale', padding: 'Padding',
    tg_sticker: 'Telegram sticker', canvas: 'Canvas',
    tg_square: '512×512 square', tg_fit: 'Longest side 512',
    outline: 'Outline', outline_color: 'Outline color',
    margin: 'Margin', margin_unit: 'px inside 512',

    // Stage
    empty_title: 'Drop a sprite sheet',
    empty_text: 'PNG with transparency works best. Plain backgrounds (white, green…) are removed for you.',
    choose: 'Choose image', sample: 'Try the example',
    paste_hint: 'or paste with <kbd>Ctrl</kbd>+<kbd>V</kbd>',
    dismiss: 'Dismiss', drop_here: 'Drop image to load',
    zoom_out: 'Zoom out (−)', zoom_actual: 'Actual size (0)', zoom_in: 'Zoom in (+)', fit: 'Fit to screen (F)',

    // Sprites panel
    sprites: 'Sprites', order: 'Order',
    sort_rows: 'Rows', sort_flat: 'Reading order', sort_size: 'Largest first',
    all: 'All',
    dl_all_title: 'Download every sprite as a ZIP',
    dl_all_tg_title: 'Download every sprite as a Telegram sticker (512 px) ZIP',
    dl_sel_title: 'Download selected',
    dl_sel_tg_title: 'Download as Telegram sticker (512 px)',
    merge: 'Merge', merge_title: 'Merge selected into one sprite (M)',
    split_btn: 'Split', split_btn_title: 'Split into separate parts (U)',
    delete_title: 'Remove (Delete)',
    telegram: 'Telegram', telegram_zip: 'Telegram ZIP',
    tag_manual: 'Hand-drawn shape',
    dl_fmt: 'Download {fmt}', dl_tg_card: 'Download Telegram sticker (512)', remove: 'Remove',
    list_empty_img: 'No sprites found. Try removing the background, lowering the alpha threshold, or draw one with the cut tools.',
    list_empty: 'Open an image to start.',
    row_n: 'Row {n}',
    n_sprites: { one: '{n} sprite', other: '{n} sprites' },
    select_row: 'Select row', dl_row: 'Download row as ZIP', dl_row_tg: 'Download row as Telegram stickers (ZIP)',
    foot_filtered: { one: '{n} sprite hidden by the size filter (grey on canvas).', other: '{n} sprites hidden by the size filter (grey on canvas).' },
    kind_auto: 'auto', kind_grid: 'grid cell', kind_manual: 'hand-drawn',
    sel_meta: '{w}×{h} at {x},{y} · {kind}',
    hidden_filter: 'hidden by size filter',
    n_selected: { one: '{n} sprite selected', other: '{n} sprites selected' },
    sel_multi_hint: 'Merge them into one, or download as ZIP.',
    off: 'off',

    // Help
    shortcuts: 'Shortcuts',
    k_select: 'Select / edit', k_rect: 'Rectangle cut', k_poly: 'Polygon cut', k_lasso: 'Lasso cut',
    k_wand: 'Magic eraser', k_pick: 'Pick bg color', k_pan: 'Pan', k_fit: 'Fit',
    k_merge: 'Merge selected', k_split: 'Split selected', k_del: 'Remove selected', k_all: 'Select all',
    k_undo: 'Undo', k_redo: 'Redo', k_finish: 'Finish polygon', k_cancel: 'Cancel / deselect',
    k_multi: 'Multi-select', k_click: 'click', k_dl: 'Download all', got_it: 'Got it',

    // Messages
    undo: 'Undo',
    t_not_image: 'That file is not an image.',
    t_cant_read: "Couldn't read that image.",
    t_empty_img: 'Image is empty.',
    banner_no_transparency: 'No transparency found. Background looks like {swatch}{hex}.',
    banner_fragments: 'Lots of small fragments — the sprites probably have a border the same color as the background.',
    ring_6: 'Restore 6px ring',
    t_bg_auto: 'Removed the plain {hex} background automatically.',
    t_bg_removed: 'Background removed ({pct}% of pixels). Sliders now adjust it live.',
    t_nothing_erase: 'Nothing to erase there — it is already transparent or outside tolerance.',
    t_bg_color_set: 'Background color set to {hex}.',
    remove_now: 'Remove now',
    t_restored: 'Image restored to the original.',
    t_nothing_dl: 'Nothing to download.',
    t_sprite_empty: 'That sprite is empty.',
    t_packing: { one: 'Packing {n} sprite…', other: 'Packing {n} sprites…' },
    t_packing_tg: { one: 'Packing {n} Telegram sticker…', other: 'Packing {n} Telegram stickers…' },
    t_downloaded: { one: 'Downloaded {n} sprite.', other: 'Downloaded {n} sprites.' },
    t_downloaded_tg: { one: 'Downloaded {n} Telegram sticker (512 px).', other: 'Downloaded {n} Telegram stickers (512 px).' },
    t_too_big: { one: "{n} file is over Telegram's 512 KB limit — switch Format to WEBP.", other: "{n} files are over Telegram's 512 KB limit — switch Format to WEBP." },
    t_removed: { one: 'Removed {n} sprite.', other: 'Removed {n} sprites.' },
    t_nothing_split: 'Nothing to split — the selection is a single part.',
    t_split: { one: 'Split into {n} sprite.', other: 'Split into {n} sprites.' },
    t_split_specks: '{n} tiny specks hidden',
    t_min_points: 'A shape needs at least 3 points.',
    t_border_transparent: 'The border is already transparent — nothing to guess from.',
    t_bg_guess: "Background {hex}, tolerance {tol}% (from the image's noise).",
    t_open_first: 'Open an image first.',
    t_found: { one: 'Found {n} sprite.', other: 'Found {n} sprites.' },
    t_cant_example: "Couldn't load the example.",
    t_drop_image: 'Drop an image file (PNG, WEBP, JPG…).',
  };

  const uk = {
    open: 'Відкрити', open_title: 'Відкрити зображення (Ctrl+O)',
    mode_aria: 'Спосіб нарізання',
    mode_scan: 'Пошук', mode_scan_title: 'Самостійно знаходити вирізки за прозорістю',
    mode_grid: 'Сітка', mode_grid_title: 'Нарізати рівною сіткою',
    detect: 'Знайти', detect_title: 'Знайти вирізки заново',
    undo_title: 'Скасувати (Ctrl+Z)', redo_title: 'Повторити (Ctrl+Shift+Z)',
    lang_title: 'Мова',

    tools_aria: 'Знаряддя',
    tool_select: 'Вибір і правлення (V)',
    tool_rect: 'Вирізати прямокутником (R)',
    tool_poly: 'Вирізати багатокутником (P) — клацайте точки, Enter — завершити',
    tool_lasso: 'Вирізати довільним контуром (L)',
    tool_wand: 'Чарівна гумка (W) — клацніть на ділянку тла, щоб прибрати її',
    tool_pick: 'Взяти колір тла (I)',
    tool_pan: 'Пересування (H) — або затисніть Пробіл / середню кнопку миші',
    help_title: 'Клавіатурні скорочення (?)',
    hint_select: 'Клацніть вирізку, щоб вибрати · Shift+клацання — додати · тягніть по порожньому місцю — виділити рамкою · тягніть намальовану фігуру, щоб пересунути',
    hint_rect: 'Тягніть, щоб вирізати прямокутник · Shift — додати до вибраної вирізки, Alt — вирізати з неї',
    hint_poly: 'Клацайте, щоб ставити точки · Enter, подвійне клацання або клацання на першу точку — завершити · Backspace прибирає останню точку',
    hint_lasso: 'Обведіть фігуру й відпустіть · Shift — додати, Alt — вирізати',
    hint_wand: 'Клацніть на залишок тла, щоб стерти його (залежить від повзунка «Допуск»)',
    hint_pick: 'Клацніть на тло, щоб узяти його колір',
    hint_pan: 'Тягніть, щоб пересуватися · коліщатко — наближення',

    sec_bg: 'Прибирання тла',
    color: 'Колір', pick_title: 'Взяти із зображення (I)',
    auto: 'Визначити', auto_title: 'Визначити за краєм зображення',
    tolerance: 'Допуск',
    tolerance_title: 'Наскільки піксель має відрізнятися від кольору тла, щоб залишитися. Підбирається самостійно за шумом зображення під час відкриття.',
    denoise: 'Зменшення шуму',
    denoise_title: 'Усереднює шум стиснення, перш ніж визначати тло — зберігає обвідку, що лише трохи відрізняється від тла',
    smooth: 'Згладити обрис',
    smooth_title: 'Вирівнює нерівні, зашумлені краї в чистий згладжений обрис',
    softness: 'Мʼякість країв', softness_note: '(без згладжування)',
    softness_title: 'Плавне згасання країв за кольором. Діє лише тоді, коли «Згладити обрис» вимкнено — пасує для піксельної графіки та ігрових зображень.',
    bg_mode: 'Прибрати', bg_mode_edges: 'Тло, що торкається країв', bg_mode_global: 'Кожен схожий піксель',
    ring: 'Відновити обвідку',
    ring_title: 'Повертає смугу первісних пікселів довкола кожної вирізки — рятує обвідку, яка точно збігається з кольором тла',
    defringe: 'Прибрати кольорову облямівку на краях',
    remove_bg: 'Прибрати тло',
    reset: 'Скинути', reset_title: 'Повернути первісне зображення',
    bg_hint: 'Після прибирання повзунки змінюють наслідок одразу. Для залишків тла (наприклад, між руками) беріть <b>чарівну гумку (W)</b>.',

    sec_detect: 'Пошук вирізок',
    gap: 'Відстань злиття',
    split: 'Розділяти дотичні',
    split_title: 'Розділяє вирізки, що торкаються тонкою перемичкою (наприклад, наліпки, чиї обвідки стикаються). Більше значення — розрізає товщі зʼєднання.',
    alpha: 'Поріг прозорості',
    specks: 'Пропускати плями до',
    absorb: 'Тримати дрібні деталі разом із їхньою вирізкою',

    sec_grid: 'Сітка', by_count: 'За кількістю', by_size: 'За розміром клітинки',
    cols: 'Стовпці', rows: 'Рядки', cell_w: 'Ширина', cell_h: 'Висота',
    off_x: 'Відступ X', off_y: 'Відступ Y', sp_x: 'Проміжок X', sp_y: 'Проміжок Y',
    skip_empty: 'Пропускати порожні клітинки',

    sec_manual: 'Вирізання вручну',
    carve: 'Намальовані фігури забирають пікселі в знайдених вирізок',
    tip1: '<kbd>R</kbd> <kbd>P</kbd> <kbd>L</kbd> — намалювати нову фігуру вирізки',
    tip2: 'Утримуйте <kbd>Shift</kbd> під час завершення, щоб <b>додати</b> до вибраної вирізки',
    tip3: 'Утримуйте <kbd>Alt</kbd> під час завершення, щоб <b>вирізати</b> з неї',
    tip4: 'Виберіть фігуру, щоб перетягувати її точки; подвійне клацання по ребру додає точку, клацання правою кнопкою по точці — прибирає її',

    sec_filter: 'Відбір за розміром', min_w: 'Найменша ширина', min_h: 'Найменша висота', max_w: 'Найбільша ширина', max_h: 'Найбільша висота',

    sec_export: 'Збереження', format: 'Формат', name: 'Назва',
    trim: 'Обрізати прозорі краї',
    pixel: 'Масштаб для піксельної графіки (чіткі пікселі)',
    json: 'Додати до ZIP файл JSON із координатами',
    regular: 'Звичайне завантаження', scale: 'Масштаб', padding: 'Поля',
    tg_sticker: 'Наліпка Telegram', canvas: 'Полотно',
    tg_square: 'Квадрат 512×512', tg_fit: 'Довша сторона 512',
    outline: 'Обвідка', outline_color: 'Колір обвідки',
    margin: 'Відступ', margin_unit: 'px усередині 512',

    empty_title: 'Перетягніть аркуш із зображеннями',
    empty_text: 'Найкраще пасує PNG із прозорістю. Однотонне тло (біле, зелене…) буде прибрано самостійно.',
    choose: 'Вибрати зображення', sample: 'Спробувати зразок',
    paste_hint: 'або вставте через <kbd>Ctrl</kbd>+<kbd>V</kbd>',
    dismiss: 'Закрити', drop_here: 'Відпустіть, щоб відкрити',
    zoom_out: 'Віддалити (−)', zoom_actual: 'Справжній розмір (0)', zoom_in: 'Наблизити (+)', fit: 'Вмістити в екран (F)',

    sprites: 'Вирізки', order: 'Порядок',
    sort_rows: 'Рядками', sort_flat: 'Порядок читання', sort_size: 'Спершу більші',
    all: 'Усі',
    dl_all_title: 'Завантажити всі вирізки в ZIP',
    dl_all_tg_title: 'Завантажити всі вирізки як наліпки Telegram (512 px) у ZIP',
    dl_sel_title: 'Завантажити вибране',
    dl_sel_tg_title: 'Завантажити як наліпку Telegram (512 px)',
    merge: 'Обʼєднати', merge_title: 'Обʼєднати вибрані в одну вирізку (M)',
    split_btn: 'Розділити', split_btn_title: 'Розділити на окремі частини (U)',
    delete_title: 'Прибрати (Delete)',
    telegram: 'Telegram', telegram_zip: 'Telegram ZIP',
    tag_manual: 'Фігура, намальована вручну',
    dl_fmt: 'Завантажити {fmt}', dl_tg_card: 'Завантажити наліпку Telegram (512)', remove: 'Прибрати',
    list_empty_img: 'Вирізок не знайдено. Спробуйте прибрати тло, зменшити поріг прозорості або намалюйте вирізку знаряддями вирізання.',
    list_empty: 'Відкрийте зображення, щоб почати.',
    row_n: 'Рядок {n}',
    n_sprites: { one: '{n} вирізка', few: '{n} вирізки', many: '{n} вирізок', other: '{n} вирізки' },
    select_row: 'Вибрати рядок', dl_row: 'Завантажити рядок у ZIP', dl_row_tg: 'Завантажити рядок як наліпки Telegram (ZIP)',
    foot_filtered: { one: 'Відбір за розміром приховав {n} вирізку (сіра на полотні).', few: 'Відбір за розміром приховав {n} вирізки (сірі на полотні).', many: 'Відбір за розміром приховав {n} вирізок (сірі на полотні).', other: 'Відбір за розміром приховав {n} вирізки (сірі на полотні).' },
    kind_auto: 'знайдена', kind_grid: 'клітинка сітки', kind_manual: 'намальована',
    sel_meta: '{w}×{h} у {x},{y} · {kind}',
    hidden_filter: 'приховано відбором за розміром',
    n_selected: { one: 'Вибрано {n} вирізку', few: 'Вибрано {n} вирізки', many: 'Вибрано {n} вирізок', other: 'Вибрано {n} вирізки' },
    sel_multi_hint: 'Обʼєднайте їх в одну або завантажте в ZIP.',
    off: 'вимк.',

    shortcuts: 'Клавіатурні скорочення',
    k_select: 'Вибір і правлення', k_rect: 'Вирізати прямокутником', k_poly: 'Вирізати багатокутником', k_lasso: 'Довільний контур',
    k_wand: 'Чарівна гумка', k_pick: 'Взяти колір тла', k_pan: 'Пересування', k_fit: 'Вмістити',
    k_merge: 'Обʼєднати вибрані', k_split: 'Розділити вибрані', k_del: 'Прибрати вибрані', k_all: 'Вибрати все',
    k_undo: 'Скасувати', k_redo: 'Повторити', k_finish: 'Завершити багатокутник', k_cancel: 'Скасувати / зняти вибір',
    k_multi: 'Вибрати кілька', k_click: 'клацання', k_dl: 'Завантажити все', got_it: 'Зрозуміло',

    undo: 'Скасувати',
    t_not_image: 'Цей файл не є зображенням.',
    t_cant_read: 'Не вдалося прочитати зображення.',
    t_empty_img: 'Зображення порожнє.',
    banner_no_transparency: 'Прозорості не знайдено. Схоже, тло — {swatch}{hex}.',
    banner_fragments: 'Багато дрібних шматочків — схоже, обвідка вирізок того ж кольору, що й тло.',
    ring_6: 'Відновити обвідку 6px',
    t_bg_auto: 'Однотонне тло {hex} прибрано самостійно.',
    t_bg_removed: 'Тло прибрано ({pct}% пікселів). Тепер повзунки змінюють наслідок одразу.',
    t_nothing_erase: 'Тут нічого стирати — ділянка вже прозора або поза допуском.',
    t_bg_color_set: 'Колір тла: {hex}.',
    remove_now: 'Прибрати зараз',
    t_restored: 'Зображення повернуто до первісного.',
    t_nothing_dl: 'Нічого завантажувати.',
    t_sprite_empty: 'Ця вирізка порожня.',
    t_packing: { one: 'Пакую {n} вирізку…', few: 'Пакую {n} вирізки…', many: 'Пакую {n} вирізок…', other: 'Пакую {n} вирізки…' },
    t_packing_tg: { one: 'Пакую {n} наліпку Telegram…', few: 'Пакую {n} наліпки Telegram…', many: 'Пакую {n} наліпок Telegram…', other: 'Пакую {n} наліпки Telegram…' },
    t_downloaded: { one: 'Завантажено {n} вирізку.', few: 'Завантажено {n} вирізки.', many: 'Завантажено {n} вирізок.', other: 'Завантажено {n} вирізки.' },
    t_downloaded_tg: { one: 'Завантажено {n} наліпку Telegram (512 px).', few: 'Завантажено {n} наліпки Telegram (512 px).', many: 'Завантажено {n} наліпок Telegram (512 px).', other: 'Завантажено {n} наліпки Telegram (512 px).' },
    t_too_big: { one: '{n} файл перевищує обмеження Telegram у 512 КБ — змініть формат на WEBP.', few: '{n} файли перевищують обмеження Telegram у 512 КБ — змініть формат на WEBP.', many: '{n} файлів перевищують обмеження Telegram у 512 КБ — змініть формат на WEBP.', other: '{n} файлу перевищують обмеження Telegram у 512 КБ — змініть формат на WEBP.' },
    t_removed: { one: 'Прибрано {n} вирізку.', few: 'Прибрано {n} вирізки.', many: 'Прибрано {n} вирізок.', other: 'Прибрано {n} вирізки.' },
    t_nothing_split: 'Нічого розділяти — вибране складається з однієї частини.',
    t_split: { one: 'Розділено на {n} вирізку.', few: 'Розділено на {n} вирізки.', many: 'Розділено на {n} вирізок.', other: 'Розділено на {n} вирізки.' },
    t_split_specks: 'приховано дрібних плям: {n}',
    t_min_points: 'Фігурі потрібно щонайменше 3 точки.',
    t_border_transparent: 'Край уже прозорий — немає з чого визначати.',
    t_bg_guess: 'Тло {hex}, допуск {tol}% (за шумом зображення).',
    t_open_first: 'Спершу відкрийте зображення.',
    t_found: { one: 'Знайдено {n} вирізку.', few: 'Знайдено {n} вирізки.', many: 'Знайдено {n} вирізок.', other: 'Знайдено {n} вирізки.' },
    t_cant_example: 'Не вдалося відкрити зразок.',
    t_drop_image: 'Перетягніть файл зображення (PNG, WEBP, JPG…).',
  };

  const dicts = { en, uk };
  const rules = { en: new Intl.PluralRules('en'), uk: new Intl.PluralRules('uk') };
  let lang = 'en';

  /** Translate `key`, filling {placeholders} from vars. Plural entries pick a form from vars.n. */
  function t(key, vars = {}) {
    let v = dicts[lang][key] ?? en[key] ?? key;
    if (typeof v === 'object') {
      const form = rules[lang].select(vars.n ?? 0);
      v = v[form] ?? v.other ?? v.many ?? Object.values(v)[0];
    }
    return v.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  }

  /** Apply translations to static markup tagged with data-i18n* attributes. */
  function apply(root = document) {
    for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
    for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
    for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  }

  function setLang(l) {
    lang = dicts[l] ? l : 'en';
    document.documentElement.lang = lang;
    apply();
  }

  return { t, apply, setLang, get lang() { return lang; }, languages: Object.keys(dicts) };
})();
