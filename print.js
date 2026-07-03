const VERSION_LABEL = "ver13";
const DEFAULT_PRINT_SETTINGS = { paper: "A4", orientation: "landscape", printMode: "normal", fitToOnePage: true };
const CARD_NORMAL = { w: 184, h: 76 };
const CARD_SIMPLE = { w: 150, h: 62 };
const GAP_X = 300;
const GAP_Y = 104;
const MARGIN = 28;

const els = {};
let caseData = null;
let layout = null;

window.addEventListener("DOMContentLoaded", init);

function init() {
  for (const id of ["printSubtitle", "printModeInput", "paperInput", "orientationInput", "fitInput", "backButton", "printNowButton", "emptyMessage", "paperPreview", "caseTitle", "caseMeta", "printSvg", "pageStyle"]) {
    els[id] = document.getElementById(id);
  }
  const raw = sessionStorage.getItem("souzokuPrintCaseData");
  if (!raw) return showEmpty();
  try {
    caseData = JSON.parse(raw);
    normalizeCaseData(caseData);
  } catch (error) {
    return showEmpty();
  }
  const settings = { ...DEFAULT_PRINT_SETTINGS, ...(caseData.printSettings || {}) };
  els.printModeInput.value = settings.printMode;
  els.paperInput.value = settings.paper;
  els.orientationInput.value = settings.orientation;
  els.fitInput.checked = Boolean(settings.fitToOnePage);
  els.backButton.addEventListener("click", () => { sessionStorage.setItem("souzokuReturnFromPrint", "1"); if (history.length > 1) history.back(); else window.location.href = "index.html"; });
  els.printNowButton.addEventListener("click", () => window.print());
  for (const input of [els.printModeInput, els.paperInput, els.orientationInput, els.fitInput]) {
    input.addEventListener("change", render);
  }
  render();
}

function showEmpty() {
  els.emptyMessage.hidden = false;
  els.paperPreview.hidden = true;
}

function currentSettings() {
  return {
    paper: els.paperInput.value,
    orientation: els.orientationInput.value,
    printMode: els.printModeInput.value,
    fitToOnePage: els.fitInput.checked
  };
}

function render() {
  if (!caseData) return;
  const settings = currentSettings();
  caseData.printSettings = settings;
  sessionStorage.setItem("souzokuPrintCaseData", JSON.stringify(caseData));
  els.paperPreview.className = `paper-preview paper-${settings.paper.toLowerCase()} ${settings.orientation} ${settings.fitToOnePage ? "fit-one-page" : "actual-size"}`;
  els.pageStyle.textContent = `@page { size: ${settings.paper} ${settings.orientation}; margin: 10mm; }`;
  els.caseTitle.textContent = caseData.caseInfo.caseTitle || "相続関係図";
  els.caseMeta.textContent = `${VERSION_LABEL} / ${settings.printMode === "normal" ? "通常版" : "簡易版"} / ${settings.paper}${settings.orientation === "landscape" ? "横" : "縦"}`;
  els.printSubtitle.textContent = `${caseData.caseInfo.caseTitle || "印刷プレビュー"} / ${caseData.people.length}人`;
  layout = computePrintLayout(caseData, settings);
  renderSvg(caseData, layout, settings);
}

function normalizeCaseData(data) {
  data.caseInfo = data.caseInfo || {};
  data.people = Array.isArray(data.people) ? data.people : [];
  data.parentGroups = Array.isArray(data.parentGroups) ? data.parentGroups : [];
  data.parentLinks = Array.isArray(data.parentLinks) ? data.parentLinks : [];
  data.spouseRelations = Array.isArray(data.spouseRelations) ? data.spouseRelations : [];
  data.printSettings = { ...DEFAULT_PRINT_SETTINGS, ...(data.printSettings || {}) };
}

function computePrintLayout(data, settings) {
  const card = settings.printMode === "normal" ? CARD_NORMAL : CARD_SIMPLE;
  const positions = new Map();
  const generations = computeGenerations(data);
  const linksByGroup = groupBy(data.parentLinks, "parentGroupId");
  const decedentId = data.caseInfo.decedentPersonId || data.people[0]?.personId;
  const decedent = data.people.find((person) => person.personId === decedentId) || data.people[0];
  if (decedent) positions.set(decedent.personId, { x: generationX(generations.get(decedent.personId) || 0), y: 0 });
  for (let i = 0; i < 10; i++) {
    placeSpouses(data, positions, generations);
    placeParentsForKnownChildren(data, positions, linksByGroup, generations);
    placeChildrenForKnownParents(data, positions, linksByGroup, generations);
  }
  for (let i = 0; i < 3; i += 1) {
    enforceFirstChildMidpointAlignment(data, positions, linksByGroup);
    separateSiblingChildrenAfterAlignment(data, positions, linksByGroup);
    resolveSiblingSubtreeOverlaps(data, positions, linksByGroup, card);
    resolveSpouseLineIntrusions(data, positions, linksByGroup, card);
  }
  placeRemainingPeople(data, positions, generations);
  resolveColumnOverlaps(positions, generations, card, data);
  resolveRootSubtreeOverlaps(data, positions, linksByGroup, generations, card);
  resolveColumnOverlaps(positions, generations, card, data);
  resolveSpouseLineIntrusions(data, positions, linksByGroup, card);
  enforceFirstChildMidpointAlignment(data, positions, linksByGroup);
  separateSiblingChildrenAfterAlignment(data, positions, linksByGroup);
  normalizeChildlessSpouseSlots(data, positions);
  for (let i = 0; i < 4; i += 1) {
    alignDirectFirstChildConnections(data, positions, linksByGroup);
    resolveSpouseParentBranchOverlaps(data, positions, linksByGroup, card);
    resolveSpouseLineIntrusions(data, positions, linksByGroup, card);
    resolveSiblingSubtreeOverlaps(data, positions, linksByGroup, card);
  }
  alignDirectFirstChildConnections(data, positions, linksByGroup);
  resolveSpouseParentBranchOverlaps(data, positions, linksByGroup, card);
  resolveAllCardOverlaps(data, positions, linksByGroup, card);
  alignDirectFirstChildConnections(data, positions, linksByGroup);
  separateSiblingChildrenAfterAlignment(data, positions, linksByGroup);
  clampSpouseRelationGaps(data, positions);
  alignSingleAdoptiveChildrenNearParent(data, positions, linksByGroup, Math.max(18, card.h * 0.9));
  compactParentChildDistances(data, positions, linksByGroup);
  resolveAllCardOverlaps(data, positions, linksByGroup, card);
  compactParentChildDistances(data, positions, linksByGroup);
  resolveAllCardOverlaps(data, positions, linksByGroup, card);
  clampSpouseRelationGaps(data, positions);
  alignDirectFirstChildConnections(data, positions, linksByGroup);
  compactParentChildDistances(data, positions, linksByGroup);
  resolveAllCardOverlaps(data, positions, linksByGroup, card);
  clampSpouseRelationGaps(data, positions);
  enforceParentGroupKindOrder(data, positions, linksByGroup, card);
  compactColumnYSpan(positions, card, Math.max(card.h * 1.65, GAP_Y * 0.82));
  resolveFinalCardRectOverlaps(data, positions, linksByGroup, card);
  compactColumnYSpan(positions, card, Math.max(card.h * 1.65, GAP_Y * 0.82));
  resolveFinalCardRectOverlaps(data, positions, linksByGroup, card);
  packCardRectsNoOverlap(positions, card, 8);
  enforceParentGroupKindOrder(data, positions, linksByGroup, card);
  packCardRectsNoOverlap(positions, card, 8);
  transformSemanticLayoutToVertical(data, positions, generations, card);
  const bounds = diagramBounds(positions, card);
  for (const pos of positions.values()) {
    pos.x += MARGIN - bounds.minX;
    pos.y += MARGIN - bounds.minY;
  }
  const shiftedBounds = diagramBounds(positions, card);
  return { positions, generations, linksByGroup, card, width: shiftedBounds.maxX + MARGIN, height: shiftedBounds.maxY + MARGIN };
}

function computeGenerations(data) {
  const generations = new Map();
  const decedentId = data.caseInfo.decedentPersonId || data.people[0]?.personId;
  if (decedentId) generations.set(decedentId, 0);
  let changed = true;
  while (changed) {
    changed = false;
    for (const relation of data.spouseRelations) {
      const g1 = generations.get(relation.person1Id);
      const g2 = generations.get(relation.person2Id);
      if (g1 !== undefined && g2 === undefined) { generations.set(relation.person2Id, g1); changed = true; }
      if (g2 !== undefined && g1 === undefined) { generations.set(relation.person1Id, g2); changed = true; }
    }
    const linksByGroup = groupBy(data.parentLinks, "parentGroupId");
    for (const group of data.parentGroups) {
      const parentIds = (linksByGroup.get(group.parentGroupId) || []).map((link) => link.parentId);
      const childGeneration = generations.get(group.childId);
      const parentGenerations = parentIds.map((id) => generations.get(id)).filter((value) => value !== undefined);
      if (parentGenerations.length > 0 && childGeneration === undefined) { generations.set(group.childId, Math.max(...parentGenerations) + 1); changed = true; }
      if (childGeneration !== undefined) {
        for (const parentId of parentIds) {
          if (generations.get(parentId) === undefined) { generations.set(parentId, childGeneration - 1); changed = true; }
        }
      }
    }
  }
  for (const person of data.people) if (generations.get(person.personId) === undefined) generations.set(person.personId, 0);
  return generations;
}

function transformSemanticLayoutToVertical(data, positions, generations, card) {
  const generationGap = Math.max(180, card.h + GAP_Y);
  for (const person of data.people) {
    const pos = positions.get(person.personId);
    if (!pos) continue;
    const generation = generations.get(person.personId) || 0;
    pos._layoutOldY = pos.y;
    pos.x = pos._layoutOldY;
    pos.y = generation * generationGap;
  }
  alignSpousesOnGenerationRow(data, positions, card);
  packRowsNoOverlap(data, positions, generations, card);
}

function alignSpousesOnGenerationRow(data, positions, card) {
  for (const relation of data.spouseRelations) {
    const p1 = positions.get(relation.person1Id);
    const p2 = positions.get(relation.person2Id);
    if (!p1 || !p2) continue;
    const rowY = Math.min(p1.y, p2.y);
    p1.y = rowY;
    p2.y = rowY;
    const minGap = card.w + 34;
    if (Math.abs(p1.x - p2.x) < minGap) {
      const center = average([p1.x, p2.x]);
      p1.x = center - minGap / 2;
      p2.x = center + minGap / 2;
    }
  }
}

function packRowsNoOverlap(data, positions, generations, card) {
  const rows = new Map();
  for (const person of data.people) {
    const pos = positions.get(person.personId);
    if (!pos) continue;
    const generation = generations.get(person.personId) || 0;
    if (!rows.has(generation)) rows.set(generation, []);
    rows.get(generation).push({ personId: person.personId, pos });
  }
  const minGap = card.w + 24;
  for (const row of rows.values()) {
    row.sort((a, b) => a.pos.x - b.pos.x || String(a.personId).localeCompare(String(b.personId)));
    let lastX = null;
    for (const item of row) {
      if (lastX !== null && item.pos.x < lastX + minGap) item.pos.x = lastX + minGap;
      lastX = item.pos.x;
    }
  }
}

function generationX(generation) { return generation * GAP_X; }

function placeSpouses(data, positions, generations) {
  for (const person of data.people) {
    const base = positions.get(person.personId);
    if (!base) continue;
    const relations = getSpouseRelations(data, person.personId).slice().sort(compareSpouseForLayout);
    relations.forEach((relation, index) => {
      const otherId = otherSpouseId(relation, person.personId);
      if (positions.has(otherId)) return;
      const generation = generations.get(otherId) ?? generations.get(person.personId) ?? 0;
      positions.set(otherId, { x: generationX(generation), y: base.y + spousePlacementOffset(index, generation) * GAP_Y });
    });
  }
}

function spouseSlotOffset(index) {
  const distance = Math.floor(index / 2) + 1;
  return index % 2 === 0 ? -distance : distance;
}

function spousePlacementOffset(index, generation) {
  if (generation > 0) {
    const distance = Math.floor(index / 2) + 1;
    return index % 2 === 0 ? distance : -distance;
  }
  return spouseSlotOffset(index);
}

function placeChildrenForKnownParents(data, positions, linksByGroup, generations) {
  for (const cluster of buildParentClusters(data, linksByGroup)) {
    const parentPositions = cluster.parentIds.map((id) => positions.get(id)).filter(Boolean);
    if (parentPositions.length === 0) continue;
    const parentGenerations = cluster.parentIds.map((id) => generations.get(id)).filter((value) => value !== undefined);
    const childGeneration = parentGenerations.length > 0 ? Math.max(...parentGenerations) + 1 : 1;
    const centerY = average(parentPositions.map((pos) => pos.y));
    const groups = cluster.groups.slice().sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
    groups.forEach((group, index) => {
      if (positions.has(group.childId)) return;
      const y = index === 0 ? centerY : centerY + index * GAP_Y;
      positions.set(group.childId, { x: generationX(childGeneration), y });
    });
  }
}

function placeParentsForKnownChildren(data, positions, linksByGroup, generations) {
  for (const group of data.parentGroups) {
    const child = positions.get(group.childId);
    if (!child) continue;
    const links = linksByGroup.get(group.parentGroupId) || [];
    const x = generationX((generations.get(group.childId) ?? 1) - 1);
    let used = 0;
    for (const link of links) {
      if (positions.has(link.parentId)) continue;
      positions.set(link.parentId, { x, y: child.y + used * GAP_Y });
      used += 1;
    }
  }
}


function parentGroupCenterY(data, positions, group) {
  const childPos = positions.get(group.childId);
  if (!childPos) return null;
  const groups = orderedParentGroupsForChild(data, group.childId);
  return childPos.y + parentGroupLayoutOffset(groups, group, GAP_Y + 18);
}

function firstVisibleGroupForCluster(cluster, positions) {
  return cluster.groups
    .filter((group) => group.diagramVisibility !== "hidden" && positions.has(group.childId))
    .sort((a, b) => compareChildConnectionGroup(a, b))[0] || null;
}

function enforceFirstChildMidpointAlignment(data, positions, linksByGroup) {
  const clusters = buildParentClusters(data, linksByGroup)
    .map((cluster) => {
      const parents = cluster.parentIds.map((parentId) => ({ parentId, pos: positions.get(parentId) })).filter((item) => item.pos);
      const firstGroup = firstVisibleGroupForCluster(cluster, positions);
      const centerY = firstGroup ? parentGroupCenterY(data, positions, firstGroup) : null;
      return { parents, firstGroup, centerY };
    })
    .filter((item) => item.parents.length > 0 && item.centerY !== null)
    .sort((a, b) => positions.get(b.firstGroup.childId).x - positions.get(a.firstGroup.childId).x);
  for (const item of clusters) {
    if (item.parents.length === 1) {
      if (item.firstGroup.groupKind === "adoptive") continue;
      item.parents[0].pos.y = item.centerY;
      continue;
    }
    if (item.parents.length !== 2) continue;
    const orderedParents = item.parents.slice().sort((a, b) => a.pos.y - b.pos.y || String(a.parentId).localeCompare(String(b.parentId)));
    orderedParents[0].pos.y = item.centerY - GAP_Y / 2;
    orderedParents[1].pos.y = item.centerY + GAP_Y / 2;
  }
}

function separateSiblingChildrenAfterAlignment(data, positions, linksByGroup) {
  for (const cluster of buildParentClusters(data, linksByGroup)) {
    const children = cluster.groups
      .filter((group) => group.diagramVisibility !== "hidden" && positions.has(group.childId))
      .sort((a, b) => compareChildConnectionGroup(a, b));
    if (children.length <= 1) continue;
    const firstY = positions.get(children[0].childId).y;
    children.slice(1).forEach((group, index) => {
      positions.get(group.childId).y = firstY + (index + 1) * GAP_Y;
    });
  }
}

function collectSiblingBlockIds(data, childId, positions) {
  const ids = new Set([childId]);
  const child = positions.get(childId);
  if (!child) return ids;
  for (const relation of getSpouseRelations(data, childId)) {
    const otherId = otherSpouseId(relation, childId);
    const other = positions.get(otherId);
    if (other && Math.abs(other.x - child.x) < 10) ids.add(otherId);
  }
  return ids;
}

function resolveSiblingSubtreeOverlaps(data, positions, linksByGroup, card) {
  for (const cluster of buildParentClusters(data, linksByGroup)) {
    const children = cluster.groups
      .filter((group) => group.diagramVisibility !== "hidden" && positions.has(group.childId))
      .sort((a, b) => positions.get(a.childId).y - positions.get(b.childId).y || compareChildConnectionGroup(a, b));
    let floor = -Infinity;
    for (const group of children) {
      const ids = collectSiblingBlockIds(data, group.childId, positions);
      const bounds = subtreeBounds(positions, ids, card);
      if (!bounds) continue;
      const minY = floor + Math.max(18, card.h * 0.24);
      if (bounds.minY < minY) {
        const dy = minY - bounds.minY;
        shiftPositions(positions, ids, dy);
        bounds.maxY += dy;
      }
      floor = Math.max(floor, bounds.maxY);
    }
  }
}


function spouseLineProtectedIds(data, relation) {
  const protectedIds = new Set([relation.person1Id, relation.person2Id]);
  for (const anchorId of [relation.person1Id, relation.person2Id]) {
    for (const spouseRelation of getSpouseRelations(data, anchorId)) {
      protectedIds.add(otherSpouseId(spouseRelation, anchorId));
    }
  }
  return protectedIds;
}

function clampSpouseRelationGaps(data, positions) {
  for (const relation of data.spouseRelations.slice().sort(compareSpouseForLayout)) {
    const anchorId = spouseLayoutAnchorId(data, relation);
    const otherId = otherSpouseId(relation, anchorId);
    const anchor = positions.get(anchorId);
    const other = positions.get(otherId);
    if (!anchor || !other || Math.abs(anchor.x - other.x) >= 10) continue;
    if (Math.abs(anchor.y - other.y) <= GAP_Y * 2.2) continue;
    const generation = Math.round((anchor.x - generationX(0)) / GAP_X);
    const slotIndex = spouseRelationSlotIndex(data, relation, anchorId);
    const direction = spousePlacementOffset(slotIndex, generation) >= 0 ? 1 : -1;
    other.y = chooseOpenSpouseY(positions, anchor, otherId, direction, GAP_Y, GAP_Y);
  }
}

function normalizeChildlessSpouseSlots(data, positions) {
  for (const relation of data.spouseRelations.slice().sort(compareSpouseForLayout)) {
    if (data.parentGroups.some((group) => group.spouseRelationId === relation.spouseRelationId && group.diagramVisibility !== "hidden")) continue;
    const anchorId = spouseLayoutAnchorId(data, relation);
    const otherId = otherSpouseId(relation, anchorId);
    const anchor = positions.get(anchorId);
    const other = positions.get(otherId);
    if (!anchor || !other || Math.abs(anchor.x - other.x) >= 10) continue;
    const generation = Math.round((anchor.x - generationX(0)) / GAP_X);
    const slotIndex = spouseRelationSlotIndex(data, relation, anchorId);
    const direction = spousePlacementOffset(slotIndex, generation) >= 0 ? 1 : -1;
    other.y = chooseOpenSpouseY(positions, anchor, otherId, direction, GAP_Y, GAP_Y);
  }
}


function chooseOpenSpouseY(positions, anchor, movingId, preferredDirection, gap, minDistance) {
  const directions = [preferredDirection, -preferredDirection, preferredDirection * 2, -preferredDirection * 2, preferredDirection * 3, -preferredDirection * 3];
  for (const direction of directions) {
    const y = anchor.y + direction * gap;
    let blocked = false;
    for (const [personId, pos] of positions.entries()) {
      if (personId === movingId) continue;
      if (Math.abs(pos.x - anchor.x) < 10 && Math.abs(pos.y - y) < minDistance * 0.9) {
        blocked = true;
        break;
      }
    }
    if (!blocked) return y;
  }
  return anchor.y + preferredDirection * gap;
}
function spouseLayoutAnchorId(data, relation) {
  const decedentId = data.caseInfo.decedentPersonId;
  if (relation.person1Id === decedentId || relation.person2Id === decedentId) return decedentId;
  const count1 = getSpouseRelations(data, relation.person1Id).length;
  const count2 = getSpouseRelations(data, relation.person2Id).length;
  return count1 >= count2 ? relation.person1Id : relation.person2Id;
}

function spouseRelationSlotIndex(data, relation, anchorId) {
  const relations = getSpouseRelations(data, anchorId).slice().sort(compareSpouseForLayout);
  return Math.max(0, relations.findIndex((item) => item.spouseRelationId === relation.spouseRelationId));
}

function spouseSlotDirection(data, relation, anchorId) {
  return spouseSlotOffset(spouseRelationSlotIndex(data, relation, anchorId)) >= 0 ? 1 : -1;
}

function resolveSpouseParentBranchOverlaps(data, positions, linksByGroup, card) {
  const decedentId = data.caseInfo.decedentPersonId;
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const relation of data.spouseRelations.slice().sort(compareSpouseForLayout)) {
      const p1 = positions.get(relation.person1Id);
      const p2 = positions.get(relation.person2Id);
      if (!p1 || !p2 || Math.abs(p1.x - p2.x) >= 10) continue;
      const generation = spouseRelationGeneration(relation, positions);
      if (generation > 0) continue;
      const branch1 = parentSideBranchIds(data, relation.person1Id, linksByGroup);
      const branch2 = parentSideBranchIds(data, relation.person2Id, linksByGroup);
      if (branch1.size <= 1 || branch2.size <= 1) continue;
      const bounds1 = subtreeBounds(positions, branch1, card);
      const bounds2 = subtreeBounds(positions, branch2, card);
      if (!bounds1 || !bounds2 || !rangesOverlap(bounds1.minY - 12, bounds1.maxY + 12, bounds2.minY - 12, bounds2.maxY + 12)) continue;
      const moveSecond = relation.person1Id === decedentId || (relation.person2Id !== decedentId && bounds2.minY >= bounds1.minY);
      const movingIds = moveSecond ? branch2 : branch1;
      const fixedBounds = moveSecond ? bounds1 : bounds2;
      const movingBounds = moveSecond ? bounds2 : bounds1;
      const dy = fixedBounds.maxY + spouseParentBranchGap(generation, card) - movingBounds.minY;
      if (dy <= 0) continue;
      shiftPositions(positions, movingIds, dy);
      changed = true;
    }
    if (!changed) break;
  }
}

function spouseRelationGeneration(relation, positions) {
  const p1 = positions.get(relation.person1Id);
  const p2 = positions.get(relation.person2Id);
  const x = p1?.x ?? p2?.x ?? generationX(0);
  return Math.round((x - generationX(0)) / GAP_X);
}

function spouseParentBranchGap(generation, card) {
  return generation < 0 ? Math.max(12, card.h * 0.18) : Math.max(16, card.h * 0.24);
}

function parentSideBranchIds(data, childId, linksByGroup) {
  const ids = new Set([childId]);
  for (const group of data.parentGroups) {
    if (group.childId !== childId || group.diagramVisibility === "hidden") continue;
    const links = linksByGroup.get(group.parentGroupId) || [];
    for (const link of links) collectAncestorBranchIds(data, link.parentId, linksByGroup, ids);
  }
  return ids;
}

function compactParentChildDistances(data, positions, linksByGroup) {
  for (const cluster of buildParentClusters(data, linksByGroup)) {
    const parents = cluster.parentIds.map((id) => positions.get(id)).filter(Boolean);
    if (parents.length === 0) continue;
    const centerY = average(parents.map((pos) => pos.y));
    const children = cluster.groups
      .filter((group) => group.diagramVisibility !== "hidden" && positions.has(group.childId))
      .sort((a, b) => compareChildConnectionGroup(a, b));
    if (children.length === 0) continue;
    for (let index = 0; index < children.length; index += 1) {
      const group = children[index];
      const child = positions.get(group.childId);
      if (!child) continue;
      const desiredY = index === 0 ? centerY : centerY + index * GAP_Y;
      if (Math.abs(child.y - desiredY) <= GAP_Y * 2.2) continue;
      const ids = collectVisibleSubtreeIds(data, group.childId, linksByGroup);
      for (const parentId of cluster.parentIds) ids.delete(parentId);
      shiftPositions(positions, ids, desiredY - child.y);
    }
  }
}

function alignDirectFirstChildConnections(data, positions, linksByGroup) {
  for (const cluster of buildParentClusters(data, linksByGroup)) {
    const parents = cluster.parentIds.map((parentId) => ({ parentId, pos: positions.get(parentId) })).filter((item) => item.pos);
    if (parents.length === 0) continue;
    const visibleGroups = cluster.groups
      .filter((group) => group.diagramVisibility !== "hidden" && positions.has(group.childId))
      .sort((a, b) => compareChildConnectionGroup(a, b));
    if (visibleGroups.length === 0) continue;
    const biologicalGroups = visibleGroups.filter((group) => group.groupKind !== "adoptive");
    const directGroup = biologicalGroups[0] || (visibleGroups.length === 1 ? visibleGroups[0] : null);
    if (!directGroup) continue;
    const childPos = positions.get(directGroup.childId);
    if (!childPos) continue;
    if (parents.length === 1) {
      if (directGroup.groupKind === "adoptive") continue;
      parents[0].pos.y = childPos.y;
      continue;
    }
    if (parents.length !== 2) continue;
    const targetY = parentGroupCenterY(data, positions, directGroup) ?? childPos.y;
    const orderedParents = parents.slice().sort((a, b) => a.pos.y - b.pos.y || String(a.parentId).localeCompare(String(b.parentId)));
    const currentGap = orderedParents[1].pos.y - orderedParents[0].pos.y;
    if (currentGap > GAP_Y + 1) {
      movePersonWithChildlessSpouses(data, positions, directGroup.childId, (orderedParents[0].pos.y + orderedParents[1].pos.y) / 2 - childPos.y);
      continue;
    }
    orderedParents[0].pos.y = targetY - GAP_Y / 2;
    orderedParents[1].pos.y = targetY + GAP_Y / 2;
  }
}

function alignSingleAdoptiveChildrenNearParent(data, positions, linksByGroup, minDistance) {
  for (const group of data.parentGroups) {
    if (group.diagramVisibility === "hidden" || group.groupKind !== "adoptive") continue;
    const links = linksByGroup.get(group.parentGroupId) || [];
    if (links.length !== 1) continue;
    const parent = positions.get(links[0].parentId);
    const child = positions.get(group.childId);
    if (!parent || !child) continue;
    const targetY = chooseOpenYInColumn(positions, group.childId, child.x, parent.y, minDistance);
    const dy = targetY - child.y;
    if (Math.abs(dy) < 1) continue;
    const ids = collectVisibleSubtreeIds(data, group.childId, linksByGroup);
    ids.delete(links[0].parentId);
    shiftPositions(positions, ids, dy);
  }
}

function chooseOpenYInColumn(positions, movingId, x, preferredY, minDistance) {
  const steps = [0, 1, -1, 2, -2, 3, -3, 4, -4];
  for (const step of steps) {
    const y = preferredY + step * minDistance;
    let blocked = false;
    for (const [personId, pos] of positions.entries()) {
      if (personId === movingId) continue;
      if (Math.abs(pos.x - x) < 10 && Math.abs(pos.y - y) < minDistance * 0.9) {
        blocked = true;
        break;
      }
    }
    if (!blocked) return y;
  }
  return preferredY;
}

function movePersonWithChildlessSpouses(data, positions, personId, dy) {
  if (Math.abs(dy) < 1) return;
  const pos = positions.get(personId);
  if (pos) pos.y += dy;
  for (const relation of getSpouseRelations(data, personId)) {
    if (data.parentGroups.some((group) => group.spouseRelationId === relation.spouseRelationId && group.diagramVisibility !== "hidden")) continue;
    const other = positions.get(otherSpouseId(relation, personId));
    if (other && pos && Math.abs(other.x - pos.x) < 10) other.y += dy;
  }
}

function resolveAllCardOverlaps(data, positions, linksByGroup, card) {
  for (let pass = 0; pass < 12; pass += 1) {
    let changed = false;
    const entries = Array.from(positions.entries()).map(([personId, pos]) => ({ personId, pos }));
    entries.sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x);
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const a = entries[i];
        const b = entries[j];
        if (!cardRectsOverlap(a.pos, b.pos, card, 14, 14)) continue;
        const upper = a.pos.y <= b.pos.y ? a : b;
        const lower = a.pos.y <= b.pos.y ? b : a;
        const ids = collectSiblingBlockIds(data, lower.personId, positions);
        const bounds = subtreeBounds(positions, ids, card);
        if (!bounds) continue;
        const minY = upper.pos.y + card.h / 2 + Math.max(18, card.h * 0.24);
        const dy = Math.min(card.h * 1.6, minY - bounds.minY);
        if (dy <= 0) continue;
        shiftPositions(positions, ids, dy);
        changed = true;
      }
    }
    if (!changed) break;
  }
}

function packCardRectsNoOverlap(positions, card, gap) {
  const entries = Array.from(positions.entries()).map(([personId, pos]) => ({ personId, pos }));
  entries.sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x || String(a.personId).localeCompare(String(b.personId)));
  const placed = [];
  const rectFor = (pos) => ({ left: pos.x - card.w / 2 - gap, right: pos.x + card.w / 2 + gap, top: pos.y - card.h / 2 - gap, bottom: pos.y + card.h / 2 + gap });
  const xOverlaps = (a, b) => a.left < b.right && a.right > b.left;
  for (const entry of entries) {
    for (let guard = 0; guard < entries.length * 4; guard += 1) {
      const rect = rectFor(entry.pos);
      const hit = placed.find((item) => xOverlaps(rect, item.rect) && rect.top < item.rect.bottom && rect.bottom > item.rect.top);
      if (!hit) break;
      entry.pos.y += hit.rect.bottom - rect.top + gap;
    }
    placed.push({ entry, rect: rectFor(entry.pos) });
  }
}


function compactColumnYSpan(positions, card, maxGap) {
  const columns = new Map();
  for (const [personId, pos] of positions.entries()) {
    const key = Math.round(pos.x / 6) * 6;
    if (!columns.has(key)) columns.set(key, []);
    columns.get(key).push({ personId, pos });
  }
  const minGap = card.h + Math.max(10, card.h * 0.28);
  for (const column of columns.values()) {
    column.sort((a, b) => a.pos.y - b.pos.y);
    let previousY = null;
    for (const item of column) {
      if (previousY === null) {
        previousY = item.pos.y;
        continue;
      }
      const minY = previousY + minGap;
      const maxY = previousY + maxGap;
      if (item.pos.y > maxY) item.pos.y = maxY;
      if (item.pos.y < minY) item.pos.y = minY;
      previousY = item.pos.y;
    }
  }
  const tops = Array.from(columns.values()).map((column) => Math.min(...column.map((item) => item.pos.y)));
  if (tops.length === 0) return;
  const globalTop = Math.min(...tops);
  for (const column of columns.values()) {
    const columnTop = Math.min(...column.map((item) => item.pos.y));
    const dy = globalTop - columnTop;
    if (Math.abs(dy) < 1) continue;
    for (const item of column) item.pos.y += dy;
  }
}


function enforceParentGroupKindOrder(data, positions, linksByGroup, card) {
  for (let pass = 0; pass < 8; pass += 1) {
    let changed = false;
    for (const child of data.people) {
      const groups = orderedParentGroupsForChild(data, child.personId).filter((group) => positions.has(group.childId));
      const biologicalGroups = groups.filter((group) => group.groupKind !== "adoptive");
      const adoptiveGroups = groups.filter((group) => group.groupKind === "adoptive");
      if (biologicalGroups.length === 0 || adoptiveGroups.length === 0) continue;
      const biologicalBottom = Math.max(...biologicalGroups.map((group) => parentGroupCenterY(data, positions, linksByGroup, group)));
      let targetCenter = biologicalBottom + Math.max(card.h * 1.15, GAP_Y * 0.72);
      for (const group of adoptiveGroups.sort((a, b) => parentGroupCenterY(data, positions, linksByGroup, a) - parentGroupCenterY(data, positions, linksByGroup, b))) {
        const current = parentGroupCenterY(data, positions, linksByGroup, group);
        const dy = targetCenter - current;
        if (dy > 1) {
          shiftPositions(positions, collectParentGroupBranchIds(data, positions, linksByGroup, group), dy);
          changed = true;
        }
        targetCenter += Math.max(card.h * 1.15, GAP_Y * 0.72);
      }
    }
    if (!changed) break;
  }
}

function collectParentGroupBranchIds(data, positions, linksByGroup, group) {
  const ids = new Set();
  for (const link of linksByGroup.get(group.parentGroupId) || []) {
    collectVisibleSubtreeIds(data, link.parentId, linksByGroup, ids);
    ids.add(link.parentId);
    for (const relation of getSpouseRelations(data, link.parentId)) {
      const otherId = otherSpouseId(relation, link.parentId);
      const parent = positions.get(link.parentId);
      const other = positions.get(otherId);
      if (parent && other && Math.abs(parent.x - other.x) < 10) {
        collectVisibleSubtreeIds(data, otherId, linksByGroup, ids);
        ids.add(otherId);
      }
    }
  }
  ids.delete(group.childId);
  return ids.size > 0 ? ids : new Set([group.childId]);
}


function resolveFinalCardRectOverlaps(data, positions, linksByGroup, card) {
  for (let pass = 0; pass < 160; pass += 1) {
    const pair = findOverlappingCardPair(positions, card, 12, 12);
    if (!pair) return true;
    const lower = chooseLowerOverlapEntry(data, pair);
    const upper = lower === pair.a ? pair.b : pair.a;
    let ids = collectFinalOverlapShiftIds(data, positions, linksByGroup, lower.personId);
    if (ids.has(upper.personId)) ids = new Set([lower.personId]);
    const bounds = subtreeBounds(positions, ids, card);
    if (!bounds) continue;
    const minY = upper.rect.bottom + Math.max(16, card.h * 0.2);
    const dy = Math.max(card.h * 0.5, minY - bounds.minY);
    shiftPositions(positions, ids, dy);
  }
  return false;
}

function collectFinalOverlapShiftIds(data, positions, linksByGroup, personId) {
  return collectSiblingBlockIds(data, personId, positions);
}

function directBiologicalParentGroupsForChild(data, linksByGroup, childId) {
  const groups = data.parentGroups
    .filter((group) => group.childId === childId && group.diagramVisibility !== "hidden" && group.groupKind !== "adoptive")
    .sort(compareChildConnectionGroup);
  if (groups.length === 0) return [];
  const first = groups[0];
  const parentPositions = (linksByGroup.get(first.parentGroupId) || []).map((link) => link.parentId);
  return parentPositions.length > 0 ? [first] : [];
}

function findOverlappingCardPair(positions, card, gapX, gapY) {
  const entries = Array.from(positions.entries()).map(([personId, pos]) => ({ personId, pos, rect: cardRect(pos, card, gapX, gapY) }));
  entries.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      if (entries[j].rect.top >= entries[i].rect.bottom) break;
      if (rectsOverlap(entries[i].rect, entries[j].rect)) return { a: entries[i], b: entries[j] };
    }
  }
  return null;
}

function cardRect(pos, card, gapX, gapY) {
  return {
    left: pos.x - card.w / 2 - gapX / 2,
    right: pos.x + card.w / 2 + gapX / 2,
    top: pos.y - card.h / 2 - gapY / 2,
    bottom: pos.y + card.h / 2 + gapY / 2
  };
}

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function chooseLowerOverlapEntry(data, pair) {
  if (Math.abs(pair.a.pos.y - pair.b.pos.y) > 1) return pair.a.pos.y > pair.b.pos.y ? pair.a : pair.b;
  const decedentId = data.caseInfo.decedentPersonId;
  if (pair.a.personId === decedentId) return pair.b;
  if (pair.b.personId === decedentId) return pair.a;
  return pair.a.pos.x >= pair.b.pos.x ? pair.a : pair.b;
}

function overlapShiftIds(data, linksByGroup, upperId, lowerId) {
  const relatedLowerChild = spouseChildForOverlappingParents(data, upperId, lowerId);
  if (relatedLowerChild) return collectLineageBranchIds(data, relatedLowerChild, lowerId, linksByGroup);
  return collectVisibleSubtreeIds(data, lowerId, linksByGroup);
}

function collectLineageBranchIds(data, childId, parentId, linksByGroup, ids = new Set()) {
  if (ids.has(childId)) return ids;
  ids.add(childId);
  const parentGroups = data.parentGroups.filter((group) => group.childId === childId && group.diagramVisibility !== "hidden");
  for (const group of parentGroups) {
    const links = linksByGroup.get(group.parentGroupId) || [];
    if (!links.some((link) => link.parentId === parentId)) continue;
    for (const link of links) collectAncestorBranchIds(data, link.parentId, linksByGroup, ids);
  }
  for (const group of data.parentGroups) {
    if (group.diagramVisibility === "hidden") continue;
    const links = linksByGroup.get(group.parentGroupId) || [];
    if (links.some((link) => link.parentId === childId)) collectLineageBranchIds(data, group.childId, childId, linksByGroup, ids);
  }
  return ids;
}

function collectAncestorBranchIds(data, personId, linksByGroup, ids) {
  if (ids.has(personId)) return;
  ids.add(personId);
  for (const relation of getSpouseRelations(data, personId)) ids.add(otherSpouseId(relation, personId));
  for (const group of data.parentGroups) {
    if (group.childId !== personId || group.diagramVisibility === "hidden") continue;
    const links = linksByGroup.get(group.parentGroupId) || [];
    for (const link of links) collectAncestorBranchIds(data, link.parentId, linksByGroup, ids);
  }
}

function spouseChildForOverlappingParents(data, upperParentId, lowerParentId) {
  const upperChildren = childIdsForParent(data, upperParentId);
  const lowerChildren = childIdsForParent(data, lowerParentId);
  for (const upperChild of upperChildren) {
    for (const lowerChild of lowerChildren) {
      if (upperChild !== lowerChild && hasSpouseRelation(data, upperChild, lowerChild)) return lowerChild;
    }
  }
  return null;
}

function hasSpouseRelation(data, personA, personB) { return data.spouseRelations.some((relation) => (relation.person1Id === personA && relation.person2Id === personB) || (relation.person1Id === personB && relation.person2Id === personA)); }
function childIdsForParent(data, parentId) {
  const ids = [];
  for (const group of data.parentGroups) {
    if (group.diagramVisibility === "hidden") continue;
    if (data.parentLinks.some((link) => link.parentGroupId === group.parentGroupId && link.parentId === parentId)) ids.push(group.childId);
  }
  return ids;
}

function cardRectsOverlap(a, b, card, gapX, gapY) {
  return Math.abs(a.x - b.x) < card.w + gapX && Math.abs(a.y - b.y) < card.h + gapY;
}
function resolveSpouseLineIntrusions(data, positions, linksByGroup, card) {
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const relation of data.spouseRelations.slice().sort(compareSpouseForLayout)) {
      const p1 = positions.get(relation.person1Id);
      const p2 = positions.get(relation.person2Id);
      if (!p1 || !p2 || Math.abs(p1.x - p2.x) >= 10) continue;
      const topY = Math.min(p1.y, p2.y);
      const bottomY = Math.max(p1.y, p2.y);
      const lowerLimit = bottomY + card.h / 2 + Math.max(18, card.h * 0.35);
      const protectedIds = spouseLineProtectedIds(data, relation);
      const intruders = [];
      for (const [personId, pos] of positions.entries()) {
        if (protectedIds.has(personId)) continue;
        if (Math.abs(pos.x - p1.x) >= 10) continue;
        if (pos.y > topY + card.h / 2 && pos.y < bottomY - card.h / 2) intruders.push({ personId, pos });
      }
      intruders.sort((a, b) => a.pos.y - b.pos.y);
      for (const intruder of intruders) {
        const ids = collectVisibleSubtreeIds(data, intruder.personId, linksByGroup);
        ids.delete(relation.person1Id);
        ids.delete(relation.person2Id);
        const bounds = subtreeBounds(positions, ids, card);
        if (!bounds) continue;
        const dy = lowerLimit - bounds.minY;
        if (dy <= 0) continue;
        shiftPositions(positions, ids, dy);
        changed = true;
      }
    }
    if (!changed) break;
  }
}
function placeRemainingPeople(data, positions, generations) {
  let y = 0;
  for (const person of data.people) {
    if (positions.has(person.personId)) continue;
    positions.set(person.personId, { x: generationX(generations.get(person.personId) || 0), y });
    y += GAP_Y;
  }
}

function resolveColumnOverlaps(positions, generations, card, data = null) {
  const byX = new Map();
  for (const [id, pos] of positions) {
    const key = Math.round(pos.x);
    if (!byX.has(key)) byX.set(key, []);
    byX.get(key).push({ id, pos });
  }
  for (const items of byX.values()) {
    const blocks = spouseAwareColumnBlocks(items, data, card);
    blocks.sort((a, b) => a.center - b.center);
    let floor = -Infinity;
    for (const block of blocks) {
      const minTop = floor + Math.max(14, card.h * 0.18);
      if (block.top < minTop) {
        const dy = minTop - block.top;
        for (const item of block.items) item.pos.y += dy;
        block.top += dy;
        block.bottom += dy;
        block.center += dy;
      }
      floor = Math.max(floor, block.bottom);
    }
  }
}

function spouseAwareColumnBlocks(items, data, card) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const used = new Set();
  const blocks = [];
  if (data) {
    const relations = data.spouseRelations.slice().sort(compareSpouseForLayout);
    for (const relation of relations) {
      const a = byId.get(relation.person1Id);
      const b = byId.get(relation.person2Id);
      if (!a || !b || used.has(a.id) || used.has(b.id)) continue;
      if (Math.abs(a.pos.x - b.pos.x) >= 10) continue;
      const pair = [a, b].sort((x, y) => x.pos.y - y.pos.y);
      pair.forEach((item) => used.add(item.id));
      blocks.push(columnBlock(pair, card));
    }
  }
  for (const item of items) {
    if (!used.has(item.id)) blocks.push(columnBlock([item], card));
  }
  return blocks;
}

function columnBlock(items, card) {
  const ys = items.map((item) => item.pos.y);
  return {
    items,
    top: Math.min(...ys) - card.h / 2,
    bottom: Math.max(...ys) + card.h / 2,
    center: average(ys)
  };
}

function resolveRootSubtreeOverlaps(data, positions, linksByGroup, generations, card) {
  const roots = data.people.filter((person) => !data.parentGroups.some((group) => group.childId === person.personId)).sort((a, b) => (positions.get(a.personId)?.y || 0) - (positions.get(b.personId)?.y || 0));
  let floor = -Infinity;
  for (const root of roots) {
    const ids = collectVisibleSubtreeIds(data, root.personId, linksByGroup);
    const bounds = subtreeBounds(positions, ids, card);
    if (!bounds) continue;
    if (bounds.minY < floor + 18) {
      shiftPositions(positions, ids, floor + 18 - bounds.minY);
      bounds.maxY += floor + 18 - bounds.minY;
    }
    floor = Math.max(floor, bounds.maxY);
  }
}

function collectVisibleSubtreeIds(data, rootId, linksByGroup, ids = new Set()) {
  if (ids.has(rootId)) return ids;
  ids.add(rootId);
  for (const relation of getSpouseRelations(data, rootId)) ids.add(otherSpouseId(relation, rootId));
  for (const group of data.parentGroups) {
    const links = linksByGroup.get(group.parentGroupId) || [];
    if (links.some((link) => link.parentId === rootId)) collectVisibleSubtreeIds(data, group.childId, linksByGroup, ids);
  }
  return ids;
}

function subtreeBounds(positions, ids, card) {
  const points = [...ids].map((id) => positions.get(id)).filter(Boolean);
  if (points.length === 0) return null;
  return { minY: Math.min(...points.map((p) => p.y - card.h / 2)), maxY: Math.max(...points.map((p) => p.y + card.h / 2)) };
}

function shiftPositions(positions, ids, dy) { for (const id of ids) { const pos = positions.get(id); if (pos) pos.y += dy; } }

function diagramBounds(positions, card) {
  if (positions.size === 0) return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
  const list = [...positions.values()];
  return { minX: Math.min(...list.map((p) => p.x - card.w / 2)), minY: Math.min(...list.map((p) => p.y - card.h / 2)), maxX: Math.max(...list.map((p) => p.x + card.w / 2)), maxY: Math.max(...list.map((p) => p.y + card.h / 2)) };
}

function buildParentClusters(data, linksByGroup) {
  const map = new Map();
  for (const group of data.parentGroups) {
    if (group.diagramVisibility === "hidden") continue;
    const parentIds = (linksByGroup.get(group.parentGroupId) || []).map((link) => link.parentId).sort();
    const inferredSpouseRelationId = parentIds.length === 2 ? findSpouseRelationId(data, parentIds[0], parentIds[1]) : null;
    const key = group.spouseRelationId || inferredSpouseRelationId || parentIds.join("+") || group.parentGroupId;
    if (!map.has(key)) map.set(key, { key, parentIds, groups: [] });
    map.get(key).groups.push(group);
  }
  return [...map.values()];
}

function findSpouseRelationId(data, a, b) {
  const relation = data.spouseRelations.find((item) => (item.person1Id === a && item.person2Id === b) || (item.person1Id === b && item.person2Id === a));
  return relation?.spouseRelationId || null;
}

function renderSvg(data, layout, settings) {
  const svg = els.printSvg;
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
  svg.setAttribute("preserveAspectRatio", settings.fitToOnePage ? "xMidYMid meet" : "xMinYMin meet");
  if (!settings.fitToOnePage) {
    svg.style.width = `${layout.width}px`;
    svg.style.height = `${layout.height}px`;
  } else {
    svg.style.width = "100%";
    svg.style.height = "100%";
  }
  const lineLayer = svgEl("g", {});
  const cardLayer = svgEl("g", {});
  svg.appendChild(lineLayer);
  svg.appendChild(cardLayer);
  drawSpouseLines(data, layout, lineLayer);
  drawParentChildLines(data, layout, lineLayer);
  for (const person of data.people) {
    const pos = layout.positions.get(person.personId);
    if (!pos) continue;
    cardLayer.appendChild(settings.printMode === "normal" ? drawPrintCard(data, person, pos, layout.card) : drawSimpleCard(data, person, pos, layout.card));
  }
}

function drawSpouseLines(data, layout, layer) {
  for (const relation of data.spouseRelations) {
    const p1 = layout.positions.get(relation.person1Id);
    const p2 = layout.positions.get(relation.person2Id);
    if (!p1 || !p2) continue;
    drawSpouseConnector(layer, p1, p2, layout.card, relation, layout.positions);
  }
}

function drawSpouseConnector(layer, p1, p2, card, relation, positions) {
  if (Math.abs(p1.y - p2.y) <= 2) {
    const y = p1.y;
    const left = p1.x <= p2.x ? p1 : p2;
    const right = p1.x <= p2.x ? p2 : p1;
    const x1 = left.x + card.w / 2;
    const x2 = right.x - card.w / 2;
    drawHorizontalSpouseLine(layer, x1, y, x2, relation);
    if (relation.spouseStatus === "divorced") drawDivorceMark(layer, (x1 + x2) / 2, y - 18);
    return;
  }
  const startX = p1.x + (p2.x >= p1.x ? card.w / 2 : -card.w / 2);
  const endX = p2.x + (p2.x >= p1.x ? -card.w / 2 : card.w / 2);
  const midY = average([p1.y, p2.y]);
  drawSpousePath(layer, "M " + startX + " " + p1.y + " V " + midY + " H " + endX + " V " + p2.y, relation);
  if (relation.spouseStatus === "divorced") drawDivorceMark(layer, (startX + endX) / 2, midY - 18);
}

function drawHorizontalSpouseLine(layer, x1, y, x2, relation) {
  if (relation.spouseStatus === "commonLaw") {
    layer.appendChild(svgEl("line", { x1, y1: y, x2, y2: y, class: "connector common-law" }));
    return;
  }
  layer.appendChild(svgEl("line", { x1, y1: y - 4, x2, y2: y - 4, class: "connector" }));
  layer.appendChild(svgEl("line", { x1, y1: y + 4, x2, y2: y + 4, class: "connector" }));
}

function drawVerticalSpouseLine(layer, x, top, bottom, relation) {
  if (relation.spouseStatus === "commonLaw") {
    layer.appendChild(svgEl("line", { class: "connector common-law", x1: x, y1: top, x2: x, y2: bottom }));
    return;
  }
  layer.appendChild(svgEl("line", { class: "connector", x1: x - 4, y1: top, x2: x - 4, y2: bottom }));
  layer.appendChild(svgEl("line", { class: "connector", x1: x + 4, y1: top, x2: x + 4, y2: bottom }));
}

function spouseSidePoint(pos, card, relation, positions) {
  const offset = spouseRelationOffset(relation, pos, positions);
  return { x: pos.x - card.w / 2, y: pos.y + offset, offset };
}

function spouseRelationOffset(relation, pos, positions) {
  const sameColumn = [];
  for (const item of positions.values()) if (Math.abs(item.x - pos.x) < 10) sameColumn.push(item);
  sameColumn.sort((a, b) => a.y - b.y);
  return centeredOffset(Math.max(0, sameColumn.indexOf(pos)), sameColumn.length, 12);
}

function hasCardBetweenSameColumn(positions, p1, p2, card) {
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);
  for (const pos of positions.values()) {
    if (pos === p1 || pos === p2) continue;
    if (Math.abs(pos.x - p1.x) < 10 && pos.y > minY + card.h / 2 && pos.y < maxY - card.h / 2) return true;
  }
  return false;
}

function drawSpousePath(layer, d, relation) {
  if (relation.spouseStatus === "commonLaw") {
    layer.appendChild(svgEl("path", { class: "connector common-law", d }));
    return;
  }
  drawDoubleSpousePath(layer, d);
}

function drawDoubleSpousePath(layer, d) {
  layer.appendChild(svgEl("path", { d, fill: "none", stroke: "#111827", "stroke-width": 10, "stroke-linecap": "butt", "stroke-linejoin": "miter" }));
  layer.appendChild(svgEl("path", { d, fill: "none", stroke: "#fff", "stroke-width": 6, "stroke-linecap": "butt", "stroke-linejoin": "miter" }));
}

function drawParentChildLines(data, layout, layer) {
  for (const cluster of buildParentClusters(data, layout.linksByGroup)) {
    const parents = cluster.parentIds.map((id) => layout.positions.get(id)).filter(Boolean);
    if (parents.length === 0) continue;
    const visibleGroups = cluster.groups.filter((group) => group.diagramVisibility !== "hidden" && layout.positions.has(group.childId));
    if (visibleGroups.length === 0) continue;
    const parentAnchor = verticalParentAnchor(parents, layout.card);
    const children = visibleGroups.map((group) => ({ group, pos: layout.positions.get(group.childId) })).sort((a, b) => a.pos.x - b.pos.x);
    const trunkY = parentAnchor.y + Math.max(42, layout.card.h * 0.78);
    const needsBus = children.length > 1 || children.some((child) => Math.abs(child.pos.x - parentAnchor.x) > 2);
    if (needsBus) {
      const minX = Math.min(parentAnchor.x, ...children.map((child) => child.pos.x));
      const maxX = Math.max(parentAnchor.x, ...children.map((child) => child.pos.x));
      layer.appendChild(svgEl("line", { class: "connector", x1: parentAnchor.x, y1: parentAnchor.y, x2: parentAnchor.x, y2: trunkY }));
      layer.appendChild(svgEl("line", { class: "connector", x1: minX, y1: trunkY, x2: maxX, y2: trunkY }));
    }
    for (const child of children) {
      const childTop = child.pos.y - layout.card.h / 2;
      const d = needsBus ? "M " + child.pos.x + " " + trunkY + " V " + childTop : "M " + parentAnchor.x + " " + parentAnchor.y + " V " + childTop;
      layer.appendChild(svgEl("path", { class: "connector" + (child.group.groupKind === "adoptive" ? " adoptive" : ""), d }));
      if (child.group.adoptionKind) {
        drawText(layer, child.group.adoptionKind === "special" ? "????" : "????", child.pos.x + 6, Math.max(trunkY, childTop - 6), "relation-label", "start");
      }
    }
  }
}

function verticalParentAnchor(parents, card) {
  if (parents.length === 1) return { x: parents[0].x, y: parents[0].y + card.h / 2 };
  return { x: average(parents.map((p) => p.x)), y: average(parents.map((p) => p.y)) };
}

function planParentChildLines(data, layout, linksByGroup) {
  const verticalSegments = [];
  const parentSetLines = [];
  const paths = [];
  for (const cluster of buildParentClusters(data, linksByGroup)) {
    const parents = cluster.parentIds.map((id) => layout.positions.get(id)).filter(Boolean);
    if (parents.length === 0) continue;
    const parentAnchor = parents.length === 1 ? { x: parents[0].x + layout.card.w / 2, y: parents[0].y } : { x: average(parents.map((p) => p.x)), y: average(parents.map((p) => p.y)) };
    if (parents.length > 1 && !cluster.key.startsWith("s")) parentSetLines.push({ p1: parents[0], p2: parents[1] });
    const children = cluster.groups.map((group) => ({ group, pos: layout.positions.get(group.childId) })).filter((item) => item.pos).sort((a, b) => a.pos.y - b.pos.y);
    if (children.length === 0) continue;
    const mixedKinds = new Set(children.map((child) => child.group.groupKind)).size > 1;
    const childItems = children.map((child) => {
      const sourceY = parentAnchor.y + parentSourceOffset(data, layout, child.group, mixedKinds);
      return { ...child, sourceY, connectionY: childConnectionY(data, layout, child.group, child.pos.y) };
    });
    const directChild = childItems.find((child) => parents.length === 1 && child.group.groupKind === "adoptive") || childItems.find((child) => child.group.groupKind !== "adoptive" && Math.abs(child.pos.y - parentAnchor.y) < 1) || childItems.find((child) => child.group.groupKind !== "adoptive" && Math.abs(child.connectionY - parentAnchor.y) < 1);
    const routedChildren = directChild ? childItems.filter((child) => child !== directChild) : childItems;
    if (directChild) {
      const left = directChild.pos.x - layout.card.w / 2;
      paths.push({ kind: "horizontal", x1: parentAnchor.x, y: directChild.pos.y, x2: left, skipX: null, adoptive: directChild.group.groupKind === "adoptive" });
    }
    if (routedChildren.length === 0) continue;
    const minY = Math.min(parentAnchor.y, ...routedChildren.map((child) => child.sourceY), ...routedChildren.map((child) => child.connectionY));
    const maxY = Math.max(parentAnchor.y, ...routedChildren.map((child) => child.sourceY), ...routedChildren.map((child) => child.connectionY));
    let trunkX = Math.min(...routedChildren.map((child) => child.pos.x - layout.card.w / 2)) - 52;
    trunkX = avoidVerticalSegmentOverlap(trunkX, minY, maxY, verticalSegments, 18);
    const hasBiological = routedChildren.some((child) => child.group.groupKind !== "adoptive");
    const hasAdoptive = routedChildren.some((child) => child.group.groupKind === "adoptive");
    const adoptiveTrunkX = hasBiological && hasAdoptive ? avoidVerticalSegmentOverlap(trunkX - 24, minY, maxY, verticalSegments, 18) : trunkX;
    for (const child of routedChildren) child.trunkX = child.group.groupKind === "adoptive" ? adoptiveTrunkX : trunkX;
    for (const lane of groupBy(routedChildren, "trunkX").values()) {
      const laneMinY = Math.min(parentAnchor.y, ...lane.map((child) => child.sourceY), ...lane.map((child) => child.connectionY));
      const laneMaxY = Math.max(parentAnchor.y, ...lane.map((child) => child.sourceY), ...lane.map((child) => child.connectionY));
      const allAdoptive = lane.every((child) => child.group.groupKind === "adoptive");
      if (lane.length > 1 || lane.some((child) => child.sourceY !== child.connectionY)) verticalSegments.push({ x: lane[0].trunkX, y1: laneMinY, y2: laneMaxY, allAdoptive });
    }
    for (const child of routedChildren) {
      const left = child.pos.x - layout.card.w / 2;
      if (routedChildren.length === 1 && child.sourceY === child.connectionY) {
        paths.push({ kind: "horizontal", x1: parentAnchor.x, y: child.sourceY, x2: left, skipX: null, adoptive: child.group.groupKind === "adoptive" });
      } else {
        paths.push({ kind: "horizontal", x1: parentAnchor.x, y: child.sourceY, x2: child.trunkX, skipX: child.trunkX, adoptive: child.group.groupKind === "adoptive" });
        if (child.connectionY === child.sourceY) {
          paths.push({ kind: "horizontal", x1: child.trunkX, y: child.connectionY, x2: left, skipX: child.trunkX, adoptive: child.group.groupKind === "adoptive" });
        } else {
          paths.push({ kind: "bent", x1: child.trunkX, y1: child.sourceY, y2: child.connectionY, x2: left, adoptive: child.group.groupKind === "adoptive" });
        }
      }
      if (child.group.adoptionKind) {
        paths.push({ kind: "label", x1: child.trunkX, y: child.connectionY, x2: left, adoptive: false, label: child.group.adoptionKind === "special" ? "\u7279\u5225\u990a\u5b50" : "\u666e\u901a\u990a\u5b50", labelX: child.trunkX + 8, labelY: child.connectionY - 8 });
      }
    }
  }
  return { verticalSegments, parentSetLines, paths: paths.filter((path) => path.kind !== "label" || path.label) };
}

function parentSetVerticalSegment(p1, p2, card) {
  return { x: average([p1.x, p2.x]), y1: Math.min(p1.y, p2.y) + card.h / 2, y2: Math.max(p1.y, p2.y) - card.h / 2 };
}

function collectSpouseVerticalSegments(data, layout) {
  const segments = [];
  for (const relation of data.spouseRelations) {
    const p1 = layout.positions.get(relation.person1Id);
    const p2 = layout.positions.get(relation.person2Id);
    if (!p1 || !p2 || Math.abs(p1.x - p2.x) >= 10) continue;
    if (hasCardBetweenSameColumn(layout.positions, p1, p2, layout.card)) continue;
    segments.push({ x: p1.x, y1: Math.min(p1.y, p2.y) + layout.card.h / 2, y2: Math.max(p1.y, p2.y) - layout.card.h / 2 });
  }
  return segments;
}

function childConnectionY(data, layout, group, baseY) {
  const groups = orderedParentGroupsForChild(data, group.childId);
  return baseY + parentGroupLayoutOffset(groups, group, 14);
}

function parentGroupSourceY(data, layout, group) {
  const links = layout.linksByGroup.get(group.parentGroupId) || [];
  const positions = links.map((link) => layout.positions.get(link.parentId)).filter(Boolean);
  return positions.length ? average(positions.map((pos) => pos.y)) : 0;
}

function parentSourceOffset(data, layout, group, mixedKinds) {
  const sameChildGroups = data.parentGroups.filter((item) => item.childId === group.childId && item.diagramVisibility !== "hidden");
  if (sameChildGroups.length <= 1) return 0;
  const ordered = orderedParentGroupsForChild(data, group.childId);
  const sourceOrderOffset = parentGroupLayoutOffset(ordered, group, 14);
  if (sourceOrderOffset !== 0) return sourceOrderOffset;
  if (!mixedKinds) return 0;
  return group.groupKind === "adoptive" ? 12 : -12;
}

function avoidVerticalSegmentOverlap(x, y1, y2, segments, gap) {
  let nextX = x;
  while (segments.some((segment) => Math.abs(segment.x - nextX) < gap && rangesOverlap(y1, y2, segment.y1, segment.y2))) nextX -= gap;
  return nextX;
}

function rangesOverlap(a1, a2, b1, b2) {
  return Math.max(Math.min(a1, a2), Math.min(b1, b2)) <= Math.min(Math.max(a1, a2), Math.max(b1, b2));
}

function horizontalPathWithJumps(x1, y, x2, verticalSegments, skipX = null) {
  const dir = x2 >= x1 ? 1 : -1;
  const crosses = verticalSegments
    .filter((segment) => (skipX === null || Math.abs(segment.x - skipX) > 1) && Math.abs(segment.x - x1) > 14 && Math.abs(segment.x - x2) > 14 && isBetween(segment.x, x1, x2) && isBetween(y, segment.y1, segment.y2))
    .sort((a, b) => dir * (a.x - b.x));
  let d = `M ${x1} ${y}`;
  for (const segment of crosses) {
    const x = segment.x;
    d += ` H ${x - dir * 10} C ${x - dir * 6} ${y} ${x - dir * 6} ${y - 12} ${x} ${y - 12} C ${x + dir * 6} ${y - 12} ${x + dir * 6} ${y} ${x + dir * 10} ${y}`;
  }
  return `${d} H ${x2}`;
}

function horizontalContinuationWithJumps(x1, y, x2, verticalSegments, skipX = null) {
  return horizontalPathWithJumps(x1, y, x2, verticalSegments, skipX).replace(`M ${x1} ${y}`, "");
}

function isBetween(value, a, b) {
  return value > Math.min(a, b) && value < Math.max(a, b);
}

function centeredOffset(index, total, gap) {
  if (total <= 1) return 0;
  return (index - (total - 1) / 2) * gap;
}

function orderedParentGroupsForChild(data, childId) {
  return data.parentGroups
    .filter((item) => item.childId === childId && item.diagramVisibility !== "hidden")
    .sort(compareChildConnectionGroup);
}

function parentGroupLayoutOffset(groups, group, gap) {
  if (groups.length <= 1) return 0;
  const hasBiological = groups.some((item) => item.groupKind !== "adoptive");
  const sameKind = groups.filter((item) => item.groupKind === group.groupKind);
  const sameKindIndex = Math.max(0, sameKind.findIndex((item) => item.parentGroupId === group.parentGroupId));
  if (group.groupKind !== "adoptive") return sameKindIndex * gap;
  const biologicalCount = hasBiological ? groups.filter((item) => item.groupKind !== "adoptive").length : 0;
  return (biologicalCount + sameKindIndex) * gap;
}

function compareChildConnectionGroup(a, b) {
  const rank = { biological: 1, adoptive: 2 };
  const rankDiff = (rank[a.groupKind] || 9) - (rank[b.groupKind] || 9);
  if (rankDiff !== 0) return rankDiff;
  const orderDiff = (a.displayOrder ?? 999) - (b.displayOrder ?? 999);
  if (orderDiff !== 0) return orderDiff;
  return String(a.parentGroupId).localeCompare(String(b.parentGroupId));
}

function drawParentSetLine(layer, p1, p2, card) {
  const x = average([p1.x, p2.x]);
  layer.appendChild(svgEl("line", { class: "connector", x1: x, y1: Math.min(p1.y, p2.y) + card.h / 2, x2: x, y2: Math.max(p1.y, p2.y) - card.h / 2 }));
}

function drawDivorceMark(layer, x, y) { drawText(layer, "×", x, y + 7, "divorce-mark", "middle"); }

function drawPrintCard(data, person, pos, card) {
  const g = svgEl("g", { class: `print-card${person.personId === data.caseInfo.decedentPersonId ? " decedent" : ""}`, transform: `translate(${pos.x - card.w / 2}, ${pos.y - card.h / 2})` });
  g.appendChild(svgEl("rect", { class: "card-box", x: 0, y: 0, width: card.w, height: card.h, rx: 0 }));
  const topH = 20;
  const bottomH = 18;
  const topLeftW = Math.round(card.w * 0.3);
  const topRightW = Math.round(card.w * 0.22);
  const bottomSplitX = Math.round(card.w * 0.68);
  g.appendChild(svgEl("rect", { class: "top-band", x: 0, y: 0, width: card.w, height: topH }));
  g.appendChild(svgEl("line", { class: "card-rule", x1: topLeftW, y1: 0, x2: topLeftW, y2: topH }));
  g.appendChild(svgEl("line", { class: "card-rule", x1: card.w - topRightW, y1: 0, x2: card.w - topRightW, y2: topH }));
  g.appendChild(svgEl("rect", { class: "bottom-band", x: 0, y: card.h - bottomH, width: card.w, height: bottomH }));
  g.appendChild(svgEl("line", { class: "card-rule", x1: bottomSplitX, y1: card.h - bottomH, x2: bottomSplitX, y2: card.h }));
  drawText(g, printHeirLabel(data, person), 7, 14, "role", "start");
  drawText(g, person.relationshipLabel || "", topLeftW + (card.w - topLeftW - topRightW) / 2, 14, "relation", "middle");
  drawText(g, personSymbol(person), card.w - topRightW / 2, 15, "symbol", "middle");
  drawWrappedText(g, displayName(person), card.w / 2, 43, card.w - 18, 2, "name");
  if (person.researchStatus === "checking") drawText(g, "調査中", 8, card.h - bottomH - 6, "research", "start");
  drawText(g, printDate(person), 8, card.h - 6, "date", "start");
  drawText(g, printLifeStatus(person), card.w - 8, card.h - 6, "status", "end");
  return g;
}

function drawSimpleCard(data, person, pos, card) {
  const g = svgEl("g", { class: "simple-card", transform: `translate(${pos.x - card.w / 2}, ${pos.y - card.h / 2})` });
  g.appendChild(svgEl("rect", { class: "card-box", x: 0, y: 0, width: card.w, height: card.h, rx: 0 }));
  drawWrappedText(g, `${personSymbol(person)} ${displayName(person)}`.trim(), card.w / 2, 31, card.w - 14, 2, "name");
  drawText(g, person.relationshipLabel || printHeirLabel(data, person), card.w / 2, card.h - 10, "relation", "middle");
  return g;
}

function drawWrappedText(group, text, x, y, maxWidth, maxLines, className) {
  const value = String(text || "");
  const charsPerLine = Math.max(6, Math.floor(maxWidth / 15));
  const lines = [];
  for (let i = 0; i < value.length && lines.length < maxLines; i += charsPerLine) lines.push(value.slice(i, i + charsPerLine));
  if (value.length > charsPerLine * maxLines && lines.length > 0) lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1) + "…";
  const startY = y - (lines.length - 1) * 10;
  lines.forEach((line, index) => drawText(group, line, x, startY + index * 20, className, "middle"));
}

const WAREKI_ERAS = {
  1: "明治",
  2: "大正",
  3: "昭和",
  4: "平成",
  5: "令和"
};

function normalizeWarekiDateCode(value) {
  const digits = toAsciiDigits(value).replace(/\D/g, "");
  return /^\d{7}$/.test(digits) && WAREKI_ERAS[digits[0]] ? digits : "";
}

function toAsciiDigits(value) {
  return String(value || "").replace(/[?-?]/g, (char) => String(char.charCodeAt(0) - 0xff10));
}

function formatWarekiDateCode(code) {
  const normalized = normalizeWarekiDateCode(code);
  if (!normalized) return "";
  const era = WAREKI_ERAS[normalized[0]];
  const yearValue = Number(normalized.slice(1, 3));
  const year = yearValue === 1 ? "元" : String(yearValue);
  const month = Number(normalized.slice(3, 5));
  const day = Number(normalized.slice(5, 7));
  if (month < 1 || month > 12 || day < 1 || day > 31) return normalized;
  return `${era}${year}年${month}月${day}日`;
}
function printHeirLabel(data, person) { if (person.personId === data.caseInfo.decedentPersonId) return "\u88ab\u76f8\u7d9a\u4eba"; if (person.heirStatus === "heir") return "\u76f8\u7d9a\u4eba"; if (person.heirStatus === "nonHeir") return "\u975e\u76f8\u7d9a\u4eba"; if (person.heirStatus === "renounced") return "\u76f8\u7d9a\u653e\u68c4"; return ""; }
function personSymbol(person) {
  const lifeStatus = effectiveLifeStatus(person);
  if (person.gender === "male" && lifeStatus === "alive") return "\u25cb";
  if (person.gender === "male" && lifeStatus === "deceased") return "\u25cf";
  if (person.gender === "female" && lifeStatus === "alive") return "\u25b3";
  if (person.gender === "female" && lifeStatus === "deceased") return "\u25b2";
  return lifeStatus === "deceased" ? "\u25cf" : "\u25cb";
}
function effectiveLifeStatus(person) { return person?.deathDateWarekiCode || person?.lifeStatus === "deceased" ? "deceased" : "alive"; }
function printDate(person) { return effectiveLifeStatus(person) === "deceased" ? formatWarekiDateCode(person.deathDateWarekiCode) : formatWarekiDateCode(person.birthDateWarekiCode); }
function printLifeStatus(person) { if (effectiveLifeStatus(person) === "deceased") return "\u6b7b\u4ea1"; return person.birthDateWarekiCode ? "\u751f\u307e\u308c" : "\u751f\u5b58"; }
function displayName(person) { if (!person) return ""; const parts = [person.familyName, person.givenName].filter(Boolean); return parts.length ? parts.join("　") : "(氏名未入力)"; }
function groupBy(items, key) { const map = new Map(); for (const item of items) { const value = item[key]; if (!map.has(value)) map.set(value, []); map.get(value).push(item); } return map; }
function getSpouseRelations(data, personId) { return data.spouseRelations.filter((relation) => relation.person1Id === personId || relation.person2Id === personId); }
function otherSpouseId(relation, personId) { return relation.person1Id === personId ? relation.person2Id : relation.person1Id; }
function compareSpouseForLayout(a, b) { const rank = { married: 1, commonLaw: 2, divorced: 3 }; const orderA = a.displayOrder ?? 999; const orderB = b.displayOrder ?? 999; if (orderA !== orderB) return orderA - orderB; return (rank[a.spouseStatus] || 9) - (rank[b.spouseStatus] || 9); }
function average(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function svgEl(name, attrs) { const el = document.createElementNS("http://www.w3.org/2000/svg", name); for (const [key, value] of Object.entries(attrs || {})) { if (value !== null && value !== undefined && value !== "") el.setAttribute(key, value); } return el; }
function drawText(group, text, x, y, className, anchor) { const el = svgEl("text", { x, y, class: className, "text-anchor": anchor }); el.textContent = text || ""; group.appendChild(el); return el; }
















// Unit-based print layout override. Mirrors the input screen's spouseUnit / childUnit / siblingGroup model.
function computePrintLayout(data, settings) {
  const card = settings.printMode === "normal" ? CARD_NORMAL : CARD_SIMPLE;
  const generations = computeGenerations(data);
  const linksByGroup = groupBy(data.parentLinks, "parentGroupId");
  return computeUnitPrintLayoutOverride(data, linksByGroup, generations, card, { rowGap: Math.max(150, card.h * 2.25), unitGap: Math.max(22, card.w * 0.18), spouseGap: Math.max(52, card.w * 0.42), margin: MARGIN, minWidth: 600, minHeight: 420 });
}

function computeUnitPrintLayoutOverride(data, linksByGroup, generations, card, options) {
  const opts = { rowGap: 160, unitGap: 28, spouseGap: 64, margin: 28, minWidth: 600, minHeight: 420, ...options };
  const peopleById = mapBy(data.people, "personId");
  const model = buildLayoutUnitsPrintOverride(data, peopleById, linksByGroup, generations);
  const positions = new Map();
  for (const row of model.generationRows.values()) {
    const y = row.index * opts.rowGap;
    let x = 0;
    const units = row.childUnits.slice().sort((a, b) => unitSortKeyPrintOverride(a, peopleById).localeCompare(unitSortKeyPrintOverride(b, peopleById), "ja"));
    for (const unit of units) {
      const width = unitWidthPrintOverride(unit, card, opts);
      placeUnitMembersPrintOverride(unit, x + width / 2, y, positions, card, opts);
      x += width + opts.unitGap;
    }
  }
  for (let pass = 0; pass < 20; pass += 1) {
    alignSpouseUnitsPrintOverride(model.spouseUnits, positions, card, opts);
    alignSiblingGroupsPrintOverride(model.siblingGroups, model.childUnitsByPerson, positions, card, opts);
    packGenerationRowsPrintOverride(model.generationRows, positions, card, opts);
  }
  const bounds = diagramBounds(positions, card);
  for (const pos of positions.values()) {
    pos.x += opts.margin - bounds.minX;
    pos.y += opts.margin - bounds.minY;
  }
  const shiftedBounds = diagramBounds(positions, card);
  const layout = { positions, generations, generationRows: model.generationRows, spouseUnits: model.spouseUnits, childUnits: model.childUnits, childUnitsByPerson: model.childUnitsByPerson, siblingGroups: model.siblingGroups, linksByGroup, card, width: Math.max(opts.minWidth, shiftedBounds.maxX + opts.margin), height: Math.max(opts.minHeight, shiftedBounds.maxY + opts.margin) };
  layout.parentChildAnchors = buildParentChildAnchorsPrintOverride(layout);
  return layout;
}

function buildLayoutUnitsPrintOverride(data, peopleById, linksByGroup, generations) {
  for (const person of data.people) if (generations.get(person.personId) === undefined) generations.set(person.personId, 0);
  const spouseUnits = data.spouseRelations.map((relation) => ({ spouseUnitId: relation.spouseRelationId, relation, memberIds: [relation.person1Id, relation.person2Id], generation: generations.get(relation.person1Id) ?? generations.get(relation.person2Id) ?? 0 }));
  const spouseIdsByPerson = new Map();
  for (const unit of spouseUnits) for (const personId of unit.memberIds) {
    if (!spouseIdsByPerson.has(personId)) spouseIdsByPerson.set(personId, []);
    spouseIdsByPerson.get(personId).push(unit);
  }
  const visited = new Set();
  const childUnits = [];
  const childUnitsByPerson = new Map();
  for (const person of data.people) {
    if (visited.has(person.personId)) continue;
    const generation = generations.get(person.personId) ?? 0;
    const queue = [person.personId];
    const members = [];
    visited.add(person.personId);
    while (queue.length > 0) {
      const currentId = queue.shift();
      members.push(currentId);
      for (const spouseUnit of spouseIdsByPerson.get(currentId) || []) {
        for (const otherId of spouseUnit.memberIds) {
          if (visited.has(otherId)) continue;
          if ((generations.get(otherId) ?? generation) !== generation) continue;
          visited.add(otherId);
          queue.push(otherId);
        }
      }
    }
    members.sort((a, b) => String(a).localeCompare(String(b)));
    const unit = { childUnitId: `cu:${members.join("+")}`, memberIds: members, primaryPersonId: person.personId, generation };
    childUnits.push(unit);
    for (const memberId of members) childUnitsByPerson.set(memberId, unit);
  }
  const generationRows = new Map();
  for (const unit of childUnits) {
    if (!generationRows.has(unit.generation)) generationRows.set(unit.generation, { generation: unit.generation, index: unit.generation, childUnits: [] });
    generationRows.get(unit.generation).childUnits.push(unit);
  }
  const siblingGroups = buildParentClusters(data, linksByGroup).map((cluster) => {
    const visibleGroups = cluster.groups.filter((group) => group.diagramVisibility !== "hidden");
    const parentSpouseUnit = cluster.key.startsWith("s") ? spouseUnits.find((unit) => unit.spouseUnitId === cluster.key) || null : null;
    return { siblingGroupId: `sg:${cluster.key}`, parentIds: cluster.parentIds, parentSpouseUnit, childGroups: visibleGroups, childUnitIds: visibleGroups.map((group) => childUnitsByPerson.get(group.childId)?.childUnitId).filter(Boolean) };
  });
  return { spouseUnits, childUnits, childUnitsByPerson, generationRows, siblingGroups };
}

function unitSortKeyPrintOverride(unit, peopleById) { return `${String(unit.generation).padStart(4, "0")}:${unit.memberIds.map((id) => displayName(peopleById.get(id)) || id).join("/")}:${unit.childUnitId}`; }
function unitWidthPrintOverride(unit, card, opts) { return Math.max(card.w, unit.memberIds.length * card.w + Math.max(0, unit.memberIds.length - 1) * opts.spouseGap); }
function placeUnitMembersPrintOverride(unit, centerX, y, positions, card, opts) {
  const step = card.w + opts.spouseGap;
  const startX = centerX - ((unit.memberIds.length - 1) * step) / 2;
  unit.memberIds.forEach((personId, index) => positions.set(personId, { x: startX + index * step, y }));
}
function shiftUnitPrintOverride(unit, positions, dx) {
  if (!unit || Math.abs(dx) < 0.5) return;
  for (const personId of unit.memberIds) {
    const pos = positions.get(personId);
    if (pos) pos.x += dx;
  }
}
function unitBoundsPrintOverride(unit, positions, card, pad = 0) {
  const points = unit.memberIds.map((personId) => positions.get(personId)).filter(Boolean);
  if (points.length === 0) return null;
  return { left: Math.min(...points.map((pos) => pos.x - card.w / 2)) - pad, right: Math.max(...points.map((pos) => pos.x + card.w / 2)) + pad, top: Math.min(...points.map((pos) => pos.y - card.h / 2)) - pad, bottom: Math.max(...points.map((pos) => pos.y + card.h / 2)) + pad };
}
function unitCenterXPrintOverride(unit, positions) {
  const xs = unit.memberIds.map((personId) => positions.get(personId)?.x).filter((value) => value !== undefined);
  return xs.length ? average(xs) : 0;
}
function alignSpouseUnitsPrintOverride(spouseUnits, positions, card, opts) {
  for (const unit of spouseUnits) {
    const p1 = positions.get(unit.relation.person1Id), p2 = positions.get(unit.relation.person2Id);
    if (!p1 || !p2) continue;
    const y = Math.min(p1.y, p2.y);
    p1.y = y; p2.y = y;
    const minGap = card.w + opts.spouseGap;
    if (Math.abs(p1.x - p2.x) < minGap) {
      const center = average([p1.x, p2.x]);
      const dir = p1.x <= p2.x ? 1 : -1;
      p1.x = center - dir * minGap / 2;
      p2.x = center + dir * minGap / 2;
    }
  }
}
function spouseMidpointPrintOverride(relation, positions, card) {
  const p1 = positions.get(relation.person1Id), p2 = positions.get(relation.person2Id);
  if (!p1 || !p2) return null;
  const left = p1.x <= p2.x ? p1 : p2;
  const right = p1.x <= p2.x ? p2 : p1;
  return { x: (left.x + card.w / 2 + right.x - card.w / 2) / 2, y: left.y };
}
function parentAnchorForSiblingGroupPrintOverride(group, positions, card) {
  if (group.parentSpouseUnit) return spouseMidpointPrintOverride(group.parentSpouseUnit.relation, positions, card);
  const parents = group.parentIds.map((id) => positions.get(id)).filter(Boolean);
  if (parents.length === 0) return null;
  return { x: average(parents.map((pos) => pos.x)), y: Math.max(...parents.map((pos) => pos.y + card.h / 2)) };
}
function alignSiblingGroupsPrintOverride(siblingGroups, childUnitsByPerson, positions, card, opts) {
  for (const group of siblingGroups) {
    const anchor = parentAnchorForSiblingGroupPrintOverride(group, positions, card);
    if (!anchor) continue;
    const visible = group.childGroups.filter((childGroup) => childUnitsByPerson.has(childGroup.childId)).map((childGroup) => ({ childGroup, unit: childUnitsByPerson.get(childGroup.childId) }));
    if (visible.length === 0) continue;
    visible.sort((a, b) => (a.childGroup.displayOrder ?? 999) - (b.childGroup.displayOrder ?? 999) || String(a.childGroup.parentGroupId).localeCompare(String(b.childGroup.parentGroupId)));
    shiftUnitPrintOverride(visible[0].unit, positions, anchor.x - unitCenterXPrintOverride(visible[0].unit, positions));
    const unitGap = card.w + opts.spouseGap + opts.unitGap;
    for (let i = 1; i < visible.length; i += 1) {
      const side = i % 2 === 1 ? 1 : -1;
      const distance = Math.ceil(i / 2) * unitGap;
      shiftUnitPrintOverride(visible[i].unit, positions, anchor.x + side * distance - unitCenterXPrintOverride(visible[i].unit, positions));
    }
  }
}
function packGenerationRowsPrintOverride(generationRows, positions, card, opts) {
  for (const row of generationRows.values()) {
    const units = dedupeUnitsPrintOverride(row.childUnits).sort((a, b) => unitCenterXPrintOverride(a, positions) - unitCenterXPrintOverride(b, positions) || a.childUnitId.localeCompare(b.childUnitId));
    let floor = -Infinity;
    for (const unit of units) {
      const bounds = unitBoundsPrintOverride(unit, positions, card, 0);
      if (!bounds) continue;
      const minLeft = floor + opts.unitGap;
      if (bounds.left < minLeft) shiftUnitPrintOverride(unit, positions, minLeft - bounds.left);
      floor = Math.max(floor, unitBoundsPrintOverride(unit, positions, card, 0).right);
    }
  }
}
function dedupeUnitsPrintOverride(units) {
  const seen = new Set(), result = [];
  for (const unit of units) if (!seen.has(unit.childUnitId)) { seen.add(unit.childUnitId); result.push(unit); }
  return result;
}
function buildParentChildAnchorsPrintOverride(layout) {
  const anchors = new Map();
  for (const group of layout.siblingGroups) {
    const anchor = parentAnchorForSiblingGroupPrintOverride(group, layout.positions, layout.card);
    if (anchor) anchors.set(group.siblingGroupId, anchor);
  }
  return anchors;
}
function mapBy(items, key) { return new Map(items.map((item) => [item[key], item])); }
function computeUnitPrintLayoutOverride(data, linksByGroup, generations, card, options) {
  const opts = { rowGap: 160, unitGap: 28, spouseGap: 64, margin: 28, minWidth: 600, minHeight: 420, ...options };
  const peopleById = mapBy(data.people, "personId");
  const model = buildLayoutUnitsPrintOverride(data, peopleById, linksByGroup, generations);
  const positions = new Map();
  for (const row of model.generationRows.values()) {
    const y = row.index * opts.rowGap;
    let x = 0;
    const units = row.childUnits.slice().sort((a, b) => unitSortKeyPrintOverride(a, peopleById).localeCompare(unitSortKeyPrintOverride(b, peopleById), "ja"));
    for (const unit of units) {
      const width = unitWidthPrintOverride(unit, card, opts);
      placeUnitMembersPrintOverride(unit, x + width / 2, y, positions, card, opts);
      x += width + opts.unitGap;
    }
  }
  for (let pass = 0; pass < 24; pass += 1) {
    alignSpouseUnitsPrintOverride(model.spouseUnits, positions, card, opts);
    alignSiblingGroupsPrintOverride(model.siblingGroups, model.childUnitsByPerson, positions, card, opts);
    packGenerationRowsPrintOverride(model.generationRows, positions, card, opts);
  }
  alignSpouseUnitsPrintOverride(model.spouseUnits, positions, card, opts);
  alignSiblingGroupsPrintOverride(model.siblingGroups, model.childUnitsByPerson, positions, card, opts);
  const bounds = diagramBounds(positions, card);
  for (const pos of positions.values()) { pos.x += opts.margin - bounds.minX; pos.y += opts.margin - bounds.minY; }
  const shiftedBounds = diagramBounds(positions, card);
  const layout = { positions, generations, generationRows: model.generationRows, spouseUnits: model.spouseUnits, childUnits: model.childUnits, childUnitsByPerson: model.childUnitsByPerson, siblingGroups: model.siblingGroups, linksByGroup, card, width: Math.max(opts.minWidth, shiftedBounds.maxX + opts.margin), height: Math.max(opts.minHeight, shiftedBounds.maxY + opts.margin) };
  layout.parentChildAnchors = buildParentChildAnchorsPrintOverride(layout);
  return layout;
}
function lockedFirstBioUnitIdsPrintOverride(model) {
  const locked = new Set();
  for (const group of model.siblingGroups) {
    if (!group.parentSpouseUnit) continue;
    const firstBio = group.childGroups.filter((item) => item.diagramVisibility !== "hidden" && item.groupKind === "biological").sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999))[0];
    const unitId = firstBio ? model.childUnitsByPerson.get(firstBio.childId)?.childUnitId : null;
    if (unitId) locked.add(unitId);
  }
  return locked;
}
function resolveUnitOverlapsPreservingLocksPrintOverride(model, positions, card, opts) {
  const locked = lockedFirstBioUnitIdsPrintOverride(model);
  for (const row of model.generationRows.values()) {
    const units = dedupeUnitsPrintOverride(row.childUnits).sort((a, b) => unitCenterXPrintOverride(a, positions) - unitCenterXPrintOverride(b, positions) || a.childUnitId.localeCompare(b.childUnitId));
    for (let guard = 0; guard < units.length * 4; guard += 1) {
      let changed = false;
      for (let i = 0; i < units.length; i += 1) for (let j = i + 1; j < units.length; j += 1) {
        const a = units[i], b = units[j];
        const ba = unitBoundsPrintOverride(a, positions, card, 0), bb = unitBoundsPrintOverride(b, positions, card, 0);
        if (!ba || !bb || ba.right + opts.unitGap <= bb.left || bb.right + opts.unitGap <= ba.left) continue;
        const aLocked = locked.has(a.childUnitId), bLocked = locked.has(b.childUnitId);
        if (aLocked && !bLocked) shiftUnitPrintOverride(b, positions, ba.right + opts.unitGap - bb.left);
        else if (!aLocked && bLocked) shiftUnitPrintOverride(a, positions, bb.left - opts.unitGap - ba.right);
        else shiftUnitPrintOverride(b, positions, ba.right + opts.unitGap - bb.left);
        changed = true;
      }
      if (!changed) break;
    }
  }
}
function computeUnitPrintLayoutOverride(data, linksByGroup, generations, card, options) {
  const opts = { rowGap: 160, unitGap: 28, spouseGap: 64, margin: 28, minWidth: 600, minHeight: 420, ...options };
  const peopleById = mapBy(data.people, "personId");
  const model = buildLayoutUnitsPrintOverride(data, peopleById, linksByGroup, generations);
  const positions = new Map();
  for (const row of model.generationRows.values()) {
    const y = row.index * opts.rowGap;
    let x = 0;
    const units = row.childUnits.slice().sort((a, b) => unitSortKeyPrintOverride(a, peopleById).localeCompare(unitSortKeyPrintOverride(b, peopleById), "ja"));
    for (const unit of units) {
      const width = unitWidthPrintOverride(unit, card, opts);
      placeUnitMembersPrintOverride(unit, x + width / 2, y, positions, card, opts);
      x += width + opts.unitGap;
    }
  }
  for (let pass = 0; pass < 24; pass += 1) {
    alignSpouseUnitsPrintOverride(model.spouseUnits, positions, card, opts);
    alignSiblingGroupsPrintOverride(model.siblingGroups, model.childUnitsByPerson, positions, card, opts);
    resolveUnitOverlapsPreservingLocksPrintOverride(model, positions, card, opts);
  }
  alignSpouseUnitsPrintOverride(model.spouseUnits, positions, card, opts);
  alignSiblingGroupsPrintOverride(model.siblingGroups, model.childUnitsByPerson, positions, card, opts);
  resolveUnitOverlapsPreservingLocksPrintOverride(model, positions, card, opts);
  const bounds = diagramBounds(positions, card);
  for (const pos of positions.values()) { pos.x += opts.margin - bounds.minX; pos.y += opts.margin - bounds.minY; }
  const shiftedBounds = diagramBounds(positions, card);
  const layout = { positions, generations, generationRows: model.generationRows, spouseUnits: model.spouseUnits, childUnits: model.childUnits, childUnitsByPerson: model.childUnitsByPerson, siblingGroups: model.siblingGroups, linksByGroup, card, width: Math.max(opts.minWidth, shiftedBounds.maxX + opts.margin), height: Math.max(opts.minHeight, shiftedBounds.maxY + opts.margin) };
  layout.parentChildAnchors = buildParentChildAnchorsPrintOverride(layout);
  return layout;
}
function resolveUnitOverlapsPreservingLocksPrintOverride(model, positions, card, opts) {
  const locked = lockedFirstBioUnitIdsPrintOverride(model);
  for (const row of model.generationRows.values()) {
    const units = dedupeUnitsPrintOverride(row.childUnits);
    const placed = [];
    const lockedUnits = units.filter((unit) => locked.has(unit.childUnitId)).sort((a, b) => unitCenterXPrintOverride(a, positions) - unitCenterXPrintOverride(b, positions));
    const freeUnits = units.filter((unit) => !locked.has(unit.childUnitId)).sort((a, b) => unitCenterXPrintOverride(a, positions) - unitCenterXPrintOverride(b, positions));
    for (const unit of lockedUnits) placed.push({ unit, bounds: unitBoundsPrintOverride(unit, positions, card, opts.unitGap / 2) });
    for (const unit of freeUnits) {
      const current = unitCenterXPrintOverride(unit, positions);
      const raw = unitBoundsPrintOverride(unit, positions, card, 0);
      const width = raw.right - raw.left;
      let bestX = current;
      let bestScore = Infinity;
      const step = Math.max(16, Math.round((card.w + opts.unitGap) / 2));
      for (let k = 0; k <= units.length * 8; k += 1) {
        for (const dir of k === 0 ? [0] : [-1, 1]) {
          const candidate = current + dir * k * step;
          const rect = { left: candidate - width / 2 - opts.unitGap / 2, right: candidate + width / 2 + opts.unitGap / 2 };
          if (placed.some((item) => rect.left < item.bounds.right && rect.right > item.bounds.left)) continue;
          const score = Math.abs(candidate - current);
          if (score < bestScore) { bestScore = score; bestX = candidate; }
        }
        if (bestScore < Infinity) break;
      }
      shiftUnitPrintOverride(unit, positions, bestX - current);
      placed.push({ unit, bounds: unitBoundsPrintOverride(unit, positions, card, opts.unitGap / 2) });
      placed.sort((a, b) => a.bounds.left - b.bounds.left);
    }
  }
}
function alignSiblingGroupsPrintOverride(siblingGroups, childUnitsByPerson, positions, card, opts) {
  for (const group of siblingGroups) {
    const anchor = parentAnchorForSiblingGroupPrintOverride(group, positions, card);
    if (!anchor) continue;
    const visible = group.childGroups.filter((childGroup) => childUnitsByPerson.has(childGroup.childId)).map((childGroup) => ({ childGroup, unit: childUnitsByPerson.get(childGroup.childId) }));
    if (visible.length === 0) continue;
    visible.sort((a, b) => (a.childGroup.displayOrder ?? 999) - (b.childGroup.displayOrder ?? 999) || String(a.childGroup.parentGroupId).localeCompare(String(b.childGroup.parentGroupId)));
    const childX = (item) => positions.get(item.childGroup.childId)?.x ?? unitCenterXPrintOverride(item.unit, positions);
    shiftUnitPrintOverride(visible[0].unit, positions, anchor.x - childX(visible[0]));
    const unitGap = card.w + opts.spouseGap + opts.unitGap;
    for (let i = 1; i < visible.length; i += 1) {
      const side = i % 2 === 1 ? 1 : -1;
      const distance = Math.ceil(i / 2) * unitGap;
      shiftUnitPrintOverride(visible[i].unit, positions, anchor.x + side * distance - childX(visible[i]));
    }
  }
}
function computePrintLayout(data, settings) {
  const card = settings.printMode === "normal" ? CARD_NORMAL : CARD_SIMPLE;
  const generations = computeGenerations(data);
  const linksByGroup = groupBy(data.parentLinks, "parentGroupId");
  return computeUnitPrintLayoutOverride(data, linksByGroup, generations, card, { rowGap: Math.max(150, card.h * 2.25), unitGap: Math.max(28, card.w * 0.2), spouseGap: Math.max(150, card.w * 0.82), margin: MARGIN, minWidth: 600, minHeight: 420 });
}
function lockedFirstBioUnitIdsPrintOverride(model) {
  const locked = new Set();
  for (const group of model.siblingGroups) {
    if (!group.parentSpouseUnit) continue;
    const firstBio = group.childGroups.filter((item) => item.diagramVisibility !== "hidden" && item.groupKind === "biological").sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999))[0];
    const childUnitId = firstBio ? model.childUnitsByPerson.get(firstBio.childId)?.childUnitId : null;
    if (childUnitId) locked.add(childUnitId);
    for (const parentId of group.parentIds) {
      const parentUnitId = model.childUnitsByPerson.get(parentId)?.childUnitId;
      if (parentUnitId) locked.add(parentUnitId);
    }
  }
  return locked;
}

function computePrintLayout(data, settings) {
  const card = settings.printMode === "normal" ? CARD_NORMAL : CARD_SIMPLE;
  const generations = computeGenerations(data);
  const linksByGroup = groupBy(data.parentLinks, "parentGroupId");
  return computeUnitPrintLayoutOverride(data, linksByGroup, generations, card, { rowGap: Math.max(150, card.h * 2.25), unitGap: Math.max(32, card.w * 0.22), spouseGap: Math.max(250, card.w * 1.35), margin: MARGIN, minWidth: 600, minHeight: 420 });
}
function resolveHardRectOverlapsByBandPrintOverride(model, positions, card) {
  const allUnits = model.childUnits.slice();
  for (let guard = 0; guard < allUnits.length * 8; guard += 1) {
    let changed = false;
    for (let i = 0; i < allUnits.length; i += 1) for (let j = i + 1; j < allUnits.length; j += 1) {
      const a = allUnits[i], b = allUnits[j];
      const ba = unitBoundsPrintOverride(a, positions, card, 0), bb = unitBoundsPrintOverride(b, positions, card, 0);
      if (!ba || !bb || ba.left >= bb.right || ba.right <= bb.left || ba.top >= bb.bottom || ba.bottom <= bb.top) continue;
      const moving = b.generation >= a.generation ? b : a;
      const fixed = moving === b ? ba : bb;
      const movingBounds = moving === b ? bb : ba;
      shiftUnitYPrintOverride(moving, positions, fixed.bottom + 18 - movingBounds.top);
      changed = true;
    }
    if (!changed) break;
  }
}
function shiftUnitYPrintOverride(unit, positions, dy) {
  if (!unit || Math.abs(dy) < 0.5) return;
  for (const personId of unit.memberIds) {
    const pos = positions.get(personId);
    if (pos) pos.y += dy;
  }
}
function computeUnitPrintLayoutOverride(data, linksByGroup, generations, card, options) {
  const opts = { rowGap: 160, unitGap: 32, spouseGap: 250, margin: 28, minWidth: 600, minHeight: 420, ...options };
  const peopleById = mapBy(data.people, "personId");
  const model = buildLayoutUnitsPrintOverride(data, peopleById, linksByGroup, generations);
  const positions = new Map();
  for (const row of model.generationRows.values()) {
    const y = row.index * opts.rowGap;
    let x = 0;
    const units = row.childUnits.slice().sort((a, b) => unitSortKeyPrintOverride(a, peopleById).localeCompare(unitSortKeyPrintOverride(b, peopleById), "ja"));
    for (const unit of units) { const width = unitWidthPrintOverride(unit, card, opts); placeUnitMembersPrintOverride(unit, x + width / 2, y, positions, card, opts); x += width + opts.unitGap; }
  }
  for (let pass = 0; pass < 24; pass += 1) { alignSpouseUnitsPrintOverride(model.spouseUnits, positions, card, opts); alignSiblingGroupsPrintOverride(model.siblingGroups, model.childUnitsByPerson, positions, card, opts); resolveUnitOverlapsPreservingLocksPrintOverride(model, positions, card, opts); }
  alignSpouseUnitsPrintOverride(model.spouseUnits, positions, card, opts);
  alignSiblingGroupsPrintOverride(model.siblingGroups, model.childUnitsByPerson, positions, card, opts);
  resolveUnitOverlapsPreservingLocksPrintOverride(model, positions, card, opts);
  resolveHardRectOverlapsByBandPrintOverride(model, positions, card);
  const bounds = diagramBounds(positions, card);
  for (const pos of positions.values()) { pos.x += opts.margin - bounds.minX; pos.y += opts.margin - bounds.minY; }
  const shiftedBounds = diagramBounds(positions, card);
  const layout = { positions, generations, generationRows: model.generationRows, spouseUnits: model.spouseUnits, childUnits: model.childUnits, childUnitsByPerson: model.childUnitsByPerson, siblingGroups: model.siblingGroups, linksByGroup, card, width: Math.max(opts.minWidth, shiftedBounds.maxX + opts.margin), height: Math.max(opts.minHeight, shiftedBounds.maxY + opts.margin) };
  layout.parentChildAnchors = buildParentChildAnchorsPrintOverride(layout);
  return layout;
}
function computePrintLayout(data, settings) {
  const card = settings.printMode === "normal" ? CARD_NORMAL : CARD_SIMPLE;
  const generations = computeGenerations(data);
  const linksByGroup = groupBy(data.parentLinks, "parentGroupId");
  return computeUnitPrintLayoutOverride(data, linksByGroup, generations, card, { rowGap: Math.max(260, card.h * 3.4), unitGap: Math.max(32, card.w * 0.22), spouseGap: Math.max(250, card.w * 1.35), margin: MARGIN, minWidth: 600, minHeight: 420 });
}