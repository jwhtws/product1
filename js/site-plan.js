const hash = value => [...String(value)].reduce((sum, character) => ((sum << 5) - sum + character.charCodeAt(0)) | 0, 0);

export function buildingSitePlan(r) {
    const area = Number(r.facilityAreaM2);
    const validArea = Number.isFinite(area) && area > 0;
    const seed = Math.abs(hash(`${r.id || ''}|${r.name}|${r.address}|${r.category}`));
    const aspect = [.72, .88, 1.05, 1.28, 1.55, 1.85, 2.15][seed % 7];
    const width = validArea ? Math.sqrt(area * aspect) : 9;
    const depth = validArea ? area / width : 7;
    const category = String(r.category || '');
    const cafe = /카페|커피|다방|제과|디저트/.test(category);
    const heavyKitchen = /횟집|복어|중국|탕류|식육|숯불|구이/.test(category);
    const buffet = /뷔페|패밀리레스토랑/.test(category);
    const kitchenRatio = cafe ? .22 : heavyKitchen ? .38 : buffet ? .32 : .29 + (seed % 5) * .012;
    const layout = cafe || buffet ? 'rear' : ['right', 'left', 'rear'][seed % 3];
    const layoutLabel = { right: '측면 주방형', left: '역측면 주방형', rear: '후면 주방형' }[layout];
    const margin = Math.max(1.4, Math.min(3, Math.min(width, depth) * .15));
    const canvasWidth = Math.max(width + margin * 2, 11);
    const planX = (canvasWidth - width) / 2;
    const planY = margin;
    const canvasHeight = depth + margin * 2 + 4.2;
    const rooms = [];
    let hall;
    if (layout === 'rear') {
      const serviceDepth = depth * kitchenRatio;
      const kitchenWidth = width * (heavyKitchen ? .7 : .62);
      hall = { x: planX, y: planY, w: width, h: depth - serviceDepth };
      rooms.push(
        { cls: 'plan-kitchen', number: 2, x: planX, y: planY + hall.h, w: kitchenWidth, h: serviceDepth },
        { cls: 'plan-storage', number: 3, x: planX + kitchenWidth, y: planY + hall.h, w: width - kitchenWidth, h: serviceDepth / 2 },
        { cls: 'plan-restroom', number: 4, x: planX + kitchenWidth, y: planY + hall.h + serviceDepth / 2, w: width - kitchenWidth, h: serviceDepth / 2 }
      );
    } else {
      const serviceWidth = width * kitchenRatio;
      const serviceX = layout === 'right' ? planX + width - serviceWidth : planX;
      hall = { x: layout === 'right' ? planX : planX + serviceWidth, y: planY, w: width - serviceWidth, h: depth };
      rooms.push(
        { cls: 'plan-kitchen', number: 2, x: serviceX, y: planY, w: serviceWidth, h: depth * .68 },
        { cls: 'plan-storage', number: 3, x: serviceX, y: planY + depth * .68, w: serviceWidth / 2, h: depth * .32 },
        { cls: 'plan-restroom', number: 4, x: serviceX + serviceWidth / 2, y: planY + depth * .68, w: serviceWidth / 2, h: depth * .32 }
      );
    }
    rooms.unshift({ cls: 'plan-dining', number: 1, ...hall });
    const counterWidth = Math.max(.9, Math.min(2.4, hall.w * .25));
    const counter = {
      x: layout === 'left' ? hall.x + .35 : hall.x + hall.w - counterWidth - .35,
      y: layout === 'rear' ? hall.y + hall.h - .85 : hall.y + .35,
      w: counterWidth,
      h: .55
    };
    const tableCols = Math.max(1, Math.min(6, Math.floor(hall.w / (cafe ? 2.25 : 2.7))));
    const tableRows = Math.max(1, Math.min(6, Math.floor((hall.h - 1.2) / (cafe ? 2 : 2.4))));
    const roundTables = cafe || seed % 4 === 0;
    const tables = Array.from({ length: tableCols * tableRows }, (_, index) => {
      const col = index % tableCols;
      const row = Math.floor(index / tableCols);
      const x = hall.x + (col + .5) * hall.w / tableCols;
      const y = hall.y + .85 + (row + .5) * Math.max(.8, hall.h - 1.5) / tableRows;
      return roundTables
        ? `<g class="plan-table"><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r=".48"/><path d="M${(x - .82).toFixed(2)} ${y.toFixed(2)}h.3m1.04 0h.3"/></g>`
        : `<g class="plan-table"><rect x="${(x - .62).toFixed(2)}" y="${(y - .36).toFixed(2)}" width="1.24" height=".72" rx=".08"/><path d="M${(x - .92).toFixed(2)} ${(y - .25).toFixed(2)}v.5m1.84 0v-.5"/></g>`;
    }).join('');
    const entranceTop = seed % 2 === 0;
    const doorX = planX + width * (.18 + (seed % 5) * .14);
    const doorY = entranceTop ? planY : planY + depth;
    const doorPath = entranceTop
      ? `M${doorX.toFixed(2)} ${doorY.toFixed(2)}h1.1a1.1 1.1 0 0 1-1.1 1.1`
      : `M${doorX.toFixed(2)} ${doorY.toFixed(2)}h1.1a1.1 1.1 0 0 0-1.1-1.1`;
    const scaleY = planY + depth + margin + .35;
    const carX = Math.max(.7, (canvasWidth - 7.2) / 2);
    const personX = carX + 5.8;
    const personBottom = scaleY + 1.8;
    const roomFont = Math.max(1.2, Math.min(2.2, canvasWidth * .045));
    const smallFont = Math.max(1, roomFont * .72);
    const scaleFont = Math.max(.8, Math.min(1.5, canvasWidth * .03));
    const roomSvg = rooms.map(room => `<rect class="plan-zone ${room.cls}" x="${room.x.toFixed(2)}" y="${room.y.toFixed(2)}" width="${room.w.toFixed(2)}" height="${room.h.toFixed(2)}"/><text class="room-label ${room.number > 2 ? 'small' : ''}" x="${(room.x + room.w / 2).toFixed(2)}" y="${(room.y + room.h / 2 + .35).toFixed(2)}">${room.number}</text>`).join('');
    return `<aside id="building-site-plan" class="title-site-plan premises-scale"><div class="plan-title"><strong>식당 평면도</strong><span>면적·업종 기반 추정</span></div>
      <div class="site-plan real-building"><svg class="building-shape restaurant-layout-svg" preserveAspectRatio="xMidYMid meet" style="--room-font:${roomFont.toFixed(2)}px;--small-font:${smallFont.toFixed(2)}px;--scale-font:${scaleFont.toFixed(2)}px" viewBox="0 0 ${canvasWidth.toFixed(2)} ${canvasHeight.toFixed(2)}" role="img" aria-label="면적과 업종에 따라 달라지는 추정 식당 평면도">
        <rect class="plan-shell" x="${planX.toFixed(2)}" y="${planY.toFixed(2)}" width="${width.toFixed(2)}" height="${depth.toFixed(2)}"/>
        ${roomSvg}<rect class="plan-counter" x="${counter.x.toFixed(2)}" y="${counter.y.toFixed(2)}" width="${counter.w.toFixed(2)}" height="${counter.h}"/>${tables}
        <path class="plan-door" d="${doorPath}"/><text class="room-label small" x="${(counter.x + counter.w / 2).toFixed(2)}" y="${(counter.y + .42).toFixed(2)}">5</text>
        <g class="scale-car-real" aria-label="길이 4.5미터, 폭 1.8미터 차량"><rect x="${carX.toFixed(2)}" y="${scaleY.toFixed(2)}" width="4.5" height="1.8" rx=".28"/><path class="car-window" d="M${(carX + 1.1).toFixed(2)} ${(scaleY + .28).toFixed(2)}h2.3v1.24h-2.3z"/></g>
        <g class="scale-person-silhouette" fill="#244a73" stroke="none" aria-label="키 1.7미터 사람"><circle cx="${personX.toFixed(2)}" cy="${(personBottom - 1.5).toFixed(2)}" r=".2"/><path d="M${personX.toFixed(2)} ${(personBottom - 1.3).toFixed(2)}l-.34.5.2.12.14-.2v.5l-.28.92h.22l.26-.62.26.62h.22l-.28-.92v-.5l.14.2.2-.12z"/></g>
      </svg></div><div class="plan-scale-key"><span>🚗 차량 4.5×1.8m</span><span>사람 키 1.7m</span></div>
      <div class="plan-legend"><span class="dining">1 홀</span><span class="kitchen">2 주방</span><span class="storage">3 창고</span><span class="restroom">4 화장실</span><span class="counter">5 카운터</span></div>
      <dl class="building-facts"><div><dt>추정 크기·구조</dt><dd>약 ${width.toFixed(1)}×${depth.toFixed(1)}m · ${layoutLabel}</dd></div></dl>
      <div class="parking-assessment"><strong>주차 가능성 확인 중</strong><span>VWorld 대지·건축면적 조회 후 계산</span></div>
      <small>차량 4.5×1.8m·사람 1.7m를 동일 축척으로 표시 · 내부 구획과 가로세로 비율은 추정 예시</small><div class="gis-building-status">VWorld 건물정보 조회 중</div></aside>`;
  }
