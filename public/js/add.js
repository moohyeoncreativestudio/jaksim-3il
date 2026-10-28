// 운동 추가 화면 (유산소 / 근력). 점수는 모두 서버(lib/score.js)가 계산한 값을 표시한다.
(function () {
  const { api, toast, confirm, upload } = window.UI;
  const $ = (id) => document.getElementById(id);

  const ACTIVITIES = [
    { name: '러닝', icon: 'directions_run' },
    { name: '복싱', icon: 'sports_mma' },
    { name: '축구', icon: 'sports_soccer' },
    { name: '사이클', icon: 'directions_bike' },
    { name: '수영', icon: 'pool' },
    { name: '줄넘기', icon: 'sports' },
  ];
  const BODY_PARTS = ['하체', '가슴', '등', '어깨', '팔', '복근'];
  const MINUTES = { min: 1, max: 600, initial: 30 };
  const SETS = { min: 1, max: 100, initial: 5 };

  const freshCardio = () => ({ activity: ACTIVITIES[0].name, custom: false, customName: '', minutes: MINUTES.initial, intensity: 2, editingId: null });
  const freshStrength = () => ({ parts: [], sets: SETS.initial, memo: '', editingId: null });

  // 탭을 바꿔도 각 탭의 입력값은 그대로 둔다
  const state = { tab: 'cardio', cardio: freshCardio(), strength: freshStrength(), today: null, saving: false, uploading: null };

  const clamp = (v, { min, max }) => Math.min(max, Math.max(min, v));
  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const icon = (name, cls = '') => {
    const n = el('span', `icon ${cls}`.trim(), name);
    n.setAttribute('aria-hidden', 'true');
    return n;
  };

  // ---------- 그리기 ----------
  function renderTabs() {
    for (const t of ['cardio', 'strength']) {
      $(`tab-${t}`).setAttribute('aria-selected', String(state.tab === t));
      $(`panel-${t}`).hidden = state.tab !== t;
    }
    const editing = state[state.tab].editingId != null;
    $('save-label').textContent = editing ? '수정하기' : '저장하기';
  }

  function renderCardio() {
    const c = state.cardio;
    const row = $('activity-chips');
    row.replaceChildren();
    for (const a of ACTIVITIES) {
      const on = !c.custom && c.activity === a.name;
      const b = el('button', `chip${on ? ' is-selected' : ''}`);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(on));
      b.append(icon(a.icon), el('span', '', a.name));
      b.addEventListener('click', () => {
        Object.assign(c, { activity: a.name, custom: false });
        renderCardio();
      });
      row.append(b);
    }
    const custom = el('button', `chip chip--ghost${c.custom ? ' is-selected' : ''}`);
    custom.type = 'button';
    custom.setAttribute('aria-pressed', String(c.custom));
    custom.append(icon(c.custom ? 'edit' : 'add'), el('span', '', '직접 입력'));
    custom.addEventListener('click', () => {
      c.custom = true;
      renderCardio();
      $('custom-activity').focus();
    });
    row.append(custom);

    $('custom-field').hidden = !c.custom;
    if ($('custom-activity').value !== c.customName) $('custom-activity').value = c.customName;
    $('minutes-val').textContent = String(c.minutes);
    document.querySelectorAll('#intensity-options .option').forEach((o) => {
      o.setAttribute('aria-checked', String(Number(o.dataset.intensity) === c.intensity));
    });
  }

  function renderStrength() {
    const s = state.strength;
    const row = $('part-chips');
    row.replaceChildren();
    for (const p of BODY_PARTS) {
      const on = s.parts.includes(p);
      const b = el('button', `chip${on ? ' is-selected' : ''}`);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(on));
      if (on) b.append(icon('check'));
      b.append(el('span', '', p));
      b.addEventListener('click', () => {
        s.parts = on ? s.parts.filter((x) => x !== p) : [...s.parts, p];
        renderStrength();
      });
      row.append(b);
    }
    $('sets-val').textContent = String(s.sets);
    if ($('memo').value !== s.memo) $('memo').value = s.memo;
  }

  function renderToday() {
    const t = state.today;
    renderPhoto();
    $('today-score').textContent = fmt(t.exercise);
    $('today-remaining').textContent = t.remaining > 0 ? `+${fmt(t.remaining)}점 남음` : '오늘 운동 점수를 모두 채웠어요';
    $('today-gauge-fill').style.width = `${Math.min(100, (t.exercise / t.max) * 100)}%`;
    $('today-gauge').setAttribute('aria-valuenow', String(t.exercise));

    $('log-title').textContent = `오늘 완료한 운동 (${t.workouts.length}개)`;
    $('log-total').textContent = `누적 +${fmt(t.exercise)}점 반영됨`;
    const list = $('log-list');
    list.replaceChildren();
    if (!t.workouts.length) {
      list.append(el('p', 'log-empty', '아직 오늘 기록이 없어요. 첫 운동을 저장해 보세요!'));
      return;
    }
    for (const w of t.workouts) list.append(logItem(w));
  }

  function titleOf(w) {
    if (w.type === 'cardio') return `${w.activity} ${w.minutes}분 · 강도 ${w.intensity}`;
    return `근력 ${w.sets}세트${w.bodyParts.length ? ` · ${w.bodyParts.join(', ')}` : ''}`;
  }

  function logItem(w) {
    const editing = state[w.type].editingId === w.id;
    const item = el('div', `log-item${editing ? ' is-editing' : ''}`);
    const iconName = w.type === 'cardio' ? ACTIVITIES.find((a) => a.name === w.activity)?.icon ?? 'sports' : 'fitness_center';
    const iconBox = el('span', `log-item__icon${w.type === 'cardio' ? ' log-item__icon--cardio' : ''}`);
    iconBox.append(icon(iconName));
    const title = el('span', 'log-item__title');
    title.append(el('span', '', titleOf(w)), el('span', 'score-tag', `+${fmt(w.score)}점`));
    const text = el('span', 'log-item__text');
    text.append(title, el('span', 'log-item__time', `${w.timeLabel} 완료`));
    const main = el('div', 'log-item__main');
    main.append(iconBox, text);

    const edit = el('button', 'log-item__btn');
    edit.type = 'button';
    edit.setAttribute('aria-label', editing ? '수정 취소' : '수정');
    edit.append(icon(editing ? 'close' : 'edit'));
    edit.addEventListener('click', () => (editing ? cancelEdit(w.type) : startEdit(w)));
    const del = el('button', 'log-item__btn log-item__btn--delete');
    del.type = 'button';
    del.setAttribute('aria-label', '삭제');
    del.append(icon('delete'));
    del.addEventListener('click', () => remove(w));
    const actions = el('div', 'log-item__actions');
    actions.append(edit, del);

    item.append(main, actions);
    return item;
  }

  // 예상 점수: 서버가 score.js로 계산 (빠르게 여러 번 눌러도 마지막 요청만 반영)
  let previewSeq = 0;
  let previewTimer = null;
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(loadPreview, 120);
  }
  async function loadPreview() {
    const seq = ++previewSeq;
    const draft = state.tab === 'cardio'
      ? { type: 'cardio', minutes: state.cardio.minutes, intensity: state.cardio.intensity, editingId: state.cardio.editingId }
      : { type: 'strength', sets: state.strength.sets, editingId: state.strength.editingId };
    const r = await api('/api/workouts/preview', { method: 'POST', body: draft });
    if (seq !== previewSeq) return;
    const box = $('preview');
    if (!r.ok) {
      box.textContent = '-';
      return;
    }
    const p = r.data;
    const gain = el('span');
    const today = el('span', '', `오늘 ${fmt(p.after)} / ${p.max}점`);
    if (p.atCap) {
      gain.append(el('span', 'action-bar__gain', '+0점'), ' (상한 도달)');
    } else {
      gain.append(el('span', 'action-bar__gain', `+${fmt(p.recordScore)}점`), ' 획득 예정');
    }
    const tail = el('span');
    tail.append(el('span', 'action-bar__arrow', '→ '), today);
    box.replaceChildren(gain, ' ', tail);
  }

  function refreshAll() {
    renderTabs();
    renderCardio();
    renderStrength();
    renderToday();
    schedulePreview();
  }

  // ---------- 수정·삭제 ----------
  function startEdit(w) {
    if (w.type === 'cardio') {
      const preset = ACTIVITIES.some((a) => a.name === w.activity);
      state.cardio = { activity: preset ? w.activity : ACTIVITIES[0].name, custom: !preset, customName: preset ? '' : w.activity, minutes: w.minutes, intensity: w.intensity, editingId: w.id };
    } else {
      state.strength = { parts: [...w.bodyParts], sets: w.sets, memo: w.memo ?? '', editingId: w.id };
    }
    state.tab = w.type;
    hideCustomError();
    refreshAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast('기록을 불러왔어요. 고친 뒤 수정하기를 눌러 주세요.');
  }

  function cancelEdit(type) {
    state[type] = type === 'cardio' ? freshCardio() : freshStrength();
    hideCustomError();
    refreshAll();
  }

  async function remove(w) {
    const ok = await confirm({ title: '기록 삭제', message: `"${titleOf(w)}" 기록을 삭제할까요?`, confirmText: '삭제', danger: true });
    if (!ok) return;
    const r = await api(`/api/workouts/${w.id}`, { method: 'DELETE' });
    if (!r.ok) {
      toast(r.data.error || '삭제하지 못했어요.');
      return reload();
    }
    if (state[w.type].editingId === w.id) state[w.type] = w.type === 'cardio' ? freshCardio() : freshStrength();
    state.today = r.data;
    refreshAll();
    toast('삭제했어요');
  }

  // ---------- 인증샷 ----------
  const PHOTO_MAX_SIDE = 1280;
  const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

  // 카드 상태: 업로드 전 / 업로드 중 / 인증 완료. 인증샷 점수(+1)는 서버의 하루 점수(day.photo)를 따른다.
  function renderPhoto() {
    const t = state.today;
    const photo = t?.photos[t.photos.length - 1];
    const card = $('photo-card');
    const uploading = state.uploading != null;
    card.dataset.state = uploading ? 'uploading' : photo ? 'done' : 'empty';
    $('photo-pick').disabled = uploading;
    $('photo-progress-row').hidden = !uploading;
    $('photo-chevron').hidden = uploading || !!photo;
    $('photo-delete').hidden = uploading || !photo;

    const iconBox = $('photo-icon');
    const hint = $('photo-hint');
    const pill = $('photo-pill');
    hint.classList.remove('is-warn');
    if (uploading) {
      const pct = Math.round(state.uploading * 100);
      $('photo-title').textContent = '사진 올리는 중…';
      $('photo-desc').textContent = `${pct}%`;
      hint.textContent = '잠시만 기다려 주세요';
      $('photo-progress-fill').style.width = `${pct}%`;
      $('photo-progress').setAttribute('aria-valuenow', String(pct));
      return;
    }
    if (photo) {
      if (iconBox.dataset.photoId !== String(photo.id)) {
        const img = document.createElement('img');
        img.src = photo.imageUrl;
        img.alt = '오늘 올린 인증 사진';
        iconBox.replaceChildren(img);
        iconBox.dataset.photoId = String(photo.id);
      }
      $('photo-title').textContent = '인증 완료';
      $('photo-desc').textContent = `${photo.timeLabel} 업로드`;
      const counted = t.day.photo > 0;
      pill.className = `pill ${counted ? 'pill--solid' : 'pill--muted'}`;
      pill.textContent = counted ? '+1점' : '+0점';
      hint.textContent = counted ? '오늘 인증샷 +1점이 반영됐어요' : '운동을 기록해야 +1점이 반영돼요';
      hint.classList.toggle('is-warn', !counted);
      return;
    }
    if (iconBox.dataset.photoId) {
      iconBox.replaceChildren(icon('photo_camera'));
      delete iconBox.dataset.photoId;
    }
    $('photo-title').textContent = '지금 사진 찍기';
    $('photo-desc').textContent = '증거는 남겨야죠';
    pill.className = 'pill pill--solid';
    pill.textContent = '+1점';
    hint.textContent = '지금 찍은 사진을 올려 주세요';
  }

  // 긴 변 1280px, JPEG 품질 0.8로 줄인다 (2MB를 넘으면 품질을 조금 더 낮춘다)
  async function shrinkImage(file) {
    if (!file.type.startsWith('image/')) throw new Error('사진(이미지) 파일만 올릴 수 있어요.');
    let bitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      throw new Error('사진을 읽을 수 없어요. 다른 사진으로 다시 시도해 주세요.');
    }
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    for (const quality of [0.8, 0.7, 0.6]) {
      const out = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
      if (out && out.size <= PHOTO_MAX_BYTES) return out;
    }
    throw new Error('사진이 너무 커요. 다른 사진으로 다시 시도해 주세요.');
  }

  async function uploadPhoto(file) {
    let jpeg;
    try {
      jpeg = await shrinkImage(file);
    } catch (err) {
      return toast(err.message);
    }
    state.uploading = 0;
    renderPhoto();
    const r = await upload('/api/photos', jpeg, 'image/jpeg', (p) => {
      state.uploading = p;
      renderPhoto();
    });
    state.uploading = null;
    if (!r.ok) {
      renderPhoto();
      return toast(r.data.error || '사진을 올리지 못했어요.');
    }
    state.today = r.data;
    refreshAll();
    toast(r.data.day.photo > 0 ? '인증 완료! +1점' : '인증 완료! 운동을 기록하면 +1점이 반영돼요');
  }

  async function removePhoto() {
    const photo = state.today?.photos[state.today.photos.length - 1];
    if (!photo) return;
    const ok = await confirm({ title: '인증 사진 삭제', message: '오늘 올린 인증 사진을 삭제할까요?', confirmText: '삭제', danger: true });
    if (!ok) return;
    const r = await api(`/api/photos/${photo.id}`, { method: 'DELETE' });
    if (!r.ok) {
      toast(r.data.error || '삭제하지 못했어요.');
      return reload();
    }
    state.today = r.data;
    refreshAll();
    toast('사진을 삭제했어요');
  }

  // ---------- 저장 ----------
  function hideCustomError() {
    $('custom-error').hidden = true;
    $('custom-activity').removeAttribute('aria-invalid');
  }
  function showCustomError(message) {
    const p = $('custom-error');
    p.replaceChildren(icon('error'), el('span', '', message));
    p.hidden = false;
    $('custom-activity').setAttribute('aria-invalid', 'true');
    $('custom-activity').focus();
  }

  async function save() {
    if (state.saving) return;
    const type = state.tab;
    const s = state[type];
    const body = type === 'cardio'
      ? { type, activity: s.custom ? s.customName.trim() : s.activity, minutes: s.minutes, intensity: s.intensity }
      : { type, sets: s.sets, bodyParts: s.parts, memo: s.memo };
    hideCustomError();
    state.saving = true;
    $('save-btn').disabled = true;
    const editing = s.editingId != null;
    const r = await api(editing ? `/api/workouts/${s.editingId}` : '/api/workouts', { method: editing ? 'PUT' : 'POST', body });
    state.saving = false;
    $('save-btn').disabled = false;
    if (!r.ok) {
      if (r.data.field === 'activity') return showCustomError(r.data.error);
      toast(r.data.error || '저장하지 못했어요.');
      if (r.status === 403 || r.status === 404) {
        state[type] = type === 'cardio' ? freshCardio() : freshStrength();
        reload();
      }
      return;
    }
    state[type] = type === 'cardio' ? freshCardio() : freshStrength();
    state.today = r.data;
    refreshAll();
    toast(editing ? '수정했어요' : '저장했어요');
  }

  async function reload() {
    const r = await api('/api/workouts/today');
    if (!r.ok) {
      if (!state.today) return window.UI.loadError(r.data.error || '오늘 기록을 불러오지 못했어요.', reload);
      return toast(r.data.error || '기록을 불러오지 못했어요.');
    }
    state.today = r.data;
    refreshAll();
  }

  // ---------- 이벤트 ----------
  $('tab-cardio').addEventListener('click', () => {
    state.tab = 'cardio';
    renderTabs();
    schedulePreview();
  });
  $('tab-strength').addEventListener('click', () => {
    state.tab = 'strength';
    renderTabs();
    schedulePreview();
  });
  $('custom-activity').addEventListener('input', (e) => {
    state.cardio.customName = e.target.value;
    hideCustomError();
  });
  document.querySelectorAll('[data-minutes]').forEach((b) =>
    b.addEventListener('click', () => {
      state.cardio.minutes = clamp(state.cardio.minutes + Number(b.dataset.minutes), MINUTES);
      renderCardio();
      schedulePreview();
    }),
  );
  document.querySelectorAll('#intensity-options .option').forEach((o) =>
    o.addEventListener('click', () => {
      state.cardio.intensity = Number(o.dataset.intensity);
      renderCardio();
      schedulePreview();
    }),
  );
  document.querySelectorAll('[data-sets]').forEach((b) =>
    b.addEventListener('click', () => {
      state.strength.sets = clamp(state.strength.sets + Number(b.dataset.sets), SETS);
      renderStrength();
      schedulePreview();
    }),
  );
  $('memo').addEventListener('input', (e) => {
    state.strength.memo = e.target.value;
  });
  $('photo-pick').addEventListener('click', () => {
    if (state.uploading != null) return;
    if (state.today?.photos.length) return toast('사진을 바꾸려면 삭제한 뒤 다시 찍어 주세요.');
    $('photo-input').value = '';
    $('photo-input').click();
  });
  $('photo-input').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) uploadPhoto(file);
  });
  $('photo-delete').addEventListener('click', removePhoto);
  $('save-btn').addEventListener('click', save);

  if (location.hash === '#strength') state.tab = 'strength';
  window.App.ready.then((me) => {
    if (me) reload();
  });
})();
