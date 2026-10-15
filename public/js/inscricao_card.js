(function(){
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  function init() {
  const composer = document.getElementById('card-composer');
  const canvas = document.getElementById('card-canvas');
  const downloadBtn = document.getElementById('download-card');
  if (!composer || !canvas) return;
  // Obter ID de forma resiliente: atributo data-id ou URL
  let regId = (composer.getAttribute('data-id') || '').trim();
  if (!regId) {
    const m = (window.location.pathname || '').match(/\/inscricao\/card\/(\d+)/);
    if (m) regId = m[1];
  }
  if (!regId) {
    console.error('ID da inscrição não encontrado na página.');
    const msg = document.createElement('p');
    msg.style.marginTop = '12px';
    msg.style.color = '#ffd9d9';
    msg.textContent = 'ID da inscrição não encontrado. Abra a página correta do seu card.';
    composer.appendChild(msg);
    return;
  }
  const paramsGlobal = new URLSearchParams(window.location.search);
  let name = (paramsGlobal.get('name') ?? composer.getAttribute('data-name') ?? '').trim();
  let group = (paramsGlobal.get('group') ?? composer.getAttribute('data-group') ?? '').trim();
  let city = (paramsGlobal.get('city') ?? composer.getAttribute('data-city') ?? '').trim();
  let type = (paramsGlobal.get('type') ?? composer.getAttribute('data-type') ?? '').trim();

  const ctx = canvas.getContext('2d');

  // Permitir calibração do círculo via atributos opcionais (valores em proporção 0..1)
  function readRatio(attrName, fallback) {
    const raw = (composer.getAttribute(attrName) || '').trim();
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }
  // Permitir ajustar via atributos ou query (?photo-cx=, ?photo-cy=, ?photo-size=)
  // A foto é um QUADRADO que fica ATRÁS do molde e aparece pelo furo central dele.
  const photoCxRatio = readNumberPref('data-photo-cx', 0.4989);   // centro X (proporção da largura)
  const photoCyRatio = readNumberPref('data-photo-cy', 0.5672);   // centro Y (proporção da altura)
  const photoSizeRatio = readNumberPref('data-photo-size', 1.0);  // lado do quadrado (proporção da largura)
  // Overscan (pode vir via atributo ou query string ?overscan=1.0)
  function readNumberPref(nameAttr, fallback) {
    const rawAttr = (composer.getAttribute(nameAttr) || '').trim();
    const params = new URLSearchParams(window.location.search);
    const rawParam = params.get(nameAttr.replace('data-', '')) || '';
    const raw = rawParam || rawAttr;
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }
  const overscanPref = readNumberPref('data-overscan', 1.0);

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function ensureData() {
    if (name && (group || city)) return; // já temos dados
    try {
      const res = await fetch(`/inscricao/card-data/${regId}`, { headers: { 'Accept': 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        name = name || (data.name || '');
        group = group || (data.group || '');
        city = city || (data.city || '');
        type = type || (data.type || '');
      }
    } catch (e) {
      // silencioso
    }
  }

  async function compose() {
    try {
      await ensureData();
      const bg = await loadImage('/public/img/moldeCard.png');
      // Carrega somente do endpoint binário (BLOB no banco)
      let avatarImg;
      const avatarPathAttr = (composer.getAttribute('data-avatar-path') || '').trim();
      try {
        const avatarRes = await fetch(`/inscricao/avatar-data/${regId}`);
        if (avatarRes.ok) {
          const avatarBlob = await avatarRes.blob();
          const avatarUrl = URL.createObjectURL(avatarBlob);
          avatarImg = await loadImage(avatarUrl);
          // não revogar aqui; revogamos após desenhar
          avatarImg.__blobUrl = avatarUrl;
        }
      } catch (_) {
        // Se falhar, seguimos sem avatar
      }

      // Fallback: se não veio do banco, tentar caminho em disco público
      if (!avatarImg && avatarPathAttr) {
        try {
          const src = avatarPathAttr.startsWith('/public/') ? avatarPathAttr : `/public/${avatarPathAttr.replace(/^\/*/, '')}`;
          avatarImg = await loadImage(src);
        } catch (_) {
          // mantém sem avatar
        }
      }

      // Dimensiona canvas ao tamanho do molde
      canvas.width = bg.width;
      canvas.height = bg.height;
      // Exibir responsivamente dentro do card
      canvas.style.width = '100%';
      canvas.style.height = 'auto';
      canvas.style.display = 'block';

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Foto QUADRADA (sem cantos arredondados) desenhada ATRÁS do molde.
      // O molde tem o miolo transparente (o "furo") e é desenhado depois, por cima,
      // revelando a foto. Todos os cards usam o mesmo quadrado → mesmo tamanho.
      const W = canvas.width;
      const H = canvas.height;
      const side = Math.max(1, Math.min(W, Math.round(W * photoSizeRatio)));
      let photoLeft = Math.round(W * photoCxRatio - side / 2);
      let photoTop = Math.round(H * photoCyRatio - side / 2);
      photoLeft = Math.max(0, Math.min(W - side, photoLeft));
      photoTop = Math.max(0, Math.min(H - side, photoTop));

      if (avatarImg) {
        ctx.save();
        // Recorte quadrado (1:1) no quadrado da foto
        ctx.beginPath();
        ctx.rect(photoLeft, photoTop, side, side);
        ctx.clip();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        // cover fit: preenche o quadrado, cortando o excedente ao centro
        const overscan = overscanPref;
        const scale = Math.max(side / avatarImg.width, side / avatarImg.height) * overscan;
        const drawW = avatarImg.width * scale;
        const drawH = avatarImg.height * scale;
        ctx.drawImage(avatarImg, photoLeft + side / 2 - drawW / 2, photoTop + side / 2 - drawH / 2, drawW, drawH);
        ctx.restore();
        // Liberar URL de blob após uso
        try { if (avatarImg.__blobUrl) URL.revokeObjectURL(avatarImg.__blobUrl); } catch (_) {}
      } else {
        // Sem avatar: preencher o quadrado com um tom neutro para não ficar vazado
        ctx.save();
        ctx.fillStyle = '#e9eef5';
        ctx.fillRect(photoLeft, photoTop, side, side);
        ctx.restore();
      }

      // Molde POR CIMA (cobre as bordas e revela a foto pelo furo central)
      ctx.drawImage(bg, 0, 0, W, H);

      // Garantir que a fonte Bebas Neue (com subset Cyrillic) esteja carregada antes de desenhar
      try {
        await Promise.all([
          document.fonts.load('normal 64px "Bebas Neue"'),
          document.fonts.load('bold 64px "Bebas Neue"'),
          document.fonts.load('normal 40px "Bebas Neue"')
        ]);
      } catch (_) {}

      // Textos no mesmo arranjo visual da arte de referencia:
      // nome do atleta grande no topo, depois grupo e cidade centralizados.
      const centerX = canvas.width / 2;
      const baseNameSize = Math.round(canvas.width * 0.108);
      const baseGroupSize = Math.round(canvas.width * 0.064);
      const baseCitySize = Math.round(canvas.width * 0.047);
      const nameY = Math.round(canvas.height * 0.180);
      const groupY = Math.round(canvas.height * 0.230);
      const cityY = Math.round(canvas.height * 0.265);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // Nome
      let nameText = (name || '').trim();
      const parts = nameText.split(/\s+/).filter(Boolean);
      const particles = new Set(['de', 'do', 'da', 'dos', 'das', 'e']);
      const chosenParts = (parts.length >= 3 && particles.has(String(parts[1] || '').toLowerCase()))
        ? parts.slice(0, 3)
        : parts.slice(0, 2);
      nameText = chosenParts.join(' ').toUpperCase();

      const groupText = (group || '').trim().toUpperCase();
      const cityText = (city || '').trim().toUpperCase();
      const fontStack = (sz) => `normal ${sz}px "Bebas Neue Cyrillic","Bebas Neue", Arial, sans-serif`;
      const fontFallback = (sz) => `normal ${sz}px Arial, sans-serif`;
      const applyFont = (sz) => {
        ctx.font = fontStack(sz);
        const probe = ctx.measureText('TESTE').width;
        if (!probe || probe <= 0) {
          ctx.font = fontFallback(sz);
        }
      };
      const fitText = (text, baseSize, minSize, maxWidth) => {
        if (!text) return baseSize;
        let size = baseSize;
        while (size > minSize) {
          applyFont(size);
          if (ctx.measureText(text).width <= maxWidth) break;
          size -= 1;
        }
        return size;
      };
      if (nameText) {
        const nameSize = fitText(nameText, baseNameSize, Math.round(canvas.width * 0.062), canvas.width * 0.90);
        applyFont(nameSize);
        ctx.lineWidth = Math.max(3, Math.round(nameSize * 0.11));
        ctx.strokeStyle = '#ffffff';
        ctx.fillStyle = '#0a0a0a';
        ctx.strokeText(nameText, centerX, nameY);
        ctx.fillText(nameText, centerX, nameY);
      }

      // Grupo
      if (groupText) {
        const groupSize = fitText(groupText, baseGroupSize, Math.round(canvas.width * 0.04), canvas.width * 0.74);
        applyFont(groupSize);
        ctx.lineWidth = Math.max(2, Math.round(groupSize * 0.08));
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillStyle = '#ffffff';
        ctx.strokeText(groupText, centerX, groupY);
        ctx.fillText(groupText, centerX, groupY);
      }

      // Cidade
      if (cityText) {
        const citySize = fitText(cityText, baseCitySize, Math.round(canvas.width * 0.032), canvas.width * 0.62);
        applyFont(citySize);
        ctx.lineWidth = Math.max(1, Math.round(citySize * 0.08));
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillStyle = '#ffffff';
        ctx.strokeText(cityText, centerX, cityY);
        ctx.fillText(cityText, centerX, cityY);
      }

      // Não exibir tipo (ATLETA/ACOMPANHANTE)

      if (avatarImg.__blobUrl) URL.revokeObjectURL(avatarImg.__blobUrl);
    } catch (err) {
      console.error('Falha ao compor card:', err);
      const msg = document.createElement('p');
      msg.style.marginTop = '12px';
      msg.style.color = '#0e5af0';
      msg.textContent = 'Não foi possível gerar a prévia do card. Foto não encontrada no banco.';
      composer.appendChild(msg);
    }
  }

  compose();

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      try {
        const dataUrl = canvas.toDataURL('image/png');
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = `/inscricao/card-download-canvas/${regId}`;
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'data';
        input.value = dataUrl;
        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
      } catch (e) {
        console.error('Falha ao baixar card:', e);
      }
    });
  }
  }
})();
