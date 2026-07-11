const VERSION_LABEL = "ver12";
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
  arrangeMultipleParentGroupBands(data, positions, linksByGroup, card);
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
  clampSpouseRelationGaps(data, positions, card);
  alignSingleAdoptiveChildrenNearParent(data, positions, linksByGroup, Math.max(18, card.h * 0.9));
  compactParentChildDistances(data, positions, linksByGroup);
  resolveAllCardOverlaps(data, positions, linksByGroup, card);
  compactParentChildDistances(data, positions, linksByGroup);
  resolveAllCardOverlaps(data, positions, linksByGroup, card);
  clampSpouseRelationGaps(data, positions, card);
  alignDirectFirstChildConnections(data, positions, linksByGroup);
  compactParentChildDistances(data, positions, linksByGroup);
  resolveAllCardOverlaps(data, positions, linksByGroup, card);
  resolveFinalCardRectOverlaps(data, positions, linksByGroup, card);
  // Reapply semantic units after the generic resolver so print and input layouts obey the same family rules.
  for (let i = 0; i < 4; i += 1) {
    clampSpouseRelationGaps(data, positions, card);
    alignDirectFirstChildConnections(data, positions, linksByGroup);
    arrangeMultipleParentGroupBands(data, positions, linksByGroup, card);
    separateSpouseParentFamilies(data, positions, linksByGroup, card);
    alignDirectFirstChildConnections(data, positions, linksByGroup);
    normalizeSiblingBranchRows(data, positions, linksByGroup);
    resolveSiblingSubtreeOverlaps(data, positions, linksByGroup, card);
  }
  enforceGenerationColumns(positions, generations);
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
  return index % 2 === 0 ? distance : -distance;
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
    if (group.diagramVisibility === "hidden") continue;
    const child = positions.get(group.childId);
    if (!child) continue;
    const links = linksByGroup.get(group.parentGroupId) || [];
    const x = generationX((generations.get(group.childId) ?? 1) - 1);
    links.forEach((link, index) => {
      if (positions.has(link.parentId)) return;
      positions.set(link.parentId, { x, y: child.y + centeredOffset(index, links.length, GAP_Y) });
    });
  }
}


function parentGroupCenterY(data, positions, group) {
  const childPos = positions.get(group.childId);
  if (!childPos) return null;
  const groups = data.parentGroups
    .filter((item) => item.childId === group.childId && item.diagramVisibility !== "hidden" && positions.has(item.childId))
    .sort((a, b) => compareChildConnectionGroup(a, b));
  const index = Math.max(0, groups.findIndex((item) => item.parentGroupId === group.parentGroupId));
  return childPos.y + centeredOffset(index, groups.length, GAP_Y + 18);
}

function firstVisibleGroupForCluster(cluster, positions) {
  return cluster.groups
    .filter((group) => group.diagramVisibility !== "hidden" && positions.has(group.childId))
    .sort((a, b) => compareChildConnectionGroup(a, b))[0] || null;
}

function enforceFirstChildMidpointAlignment(data, positions, linksByGroup) {
  // The couple is the fixed unit; its first biological child branch moves to the couple midpoint.
  alignDirectFirstChildConnections(data, positions, linksByGroup);
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

function normalizeSiblingBranchRows(data, positions, linksByGroup) {
  for (const cluster of buildParentClusters(data, linksByGroup)) {
    const groups = cluster.groups
      .filter((group) => group.diagramVisibility !== "hidden" && positions.has(group.childId))
      .sort(compareChildConnectionGroup);
    if (groups.length < 2) continue;
    const baseY = positions.get(groups[0].childId).y;
    const parentIds = new Set(cluster.parentIds || []);
    groups.forEach((group, index) => {
      const child = positions.get(group.childId);
      const expectedY = baseY + index * GAP_Y;
      const dy = expectedY - child.y;
      if (Math.abs(dy) < 1) return;
      const ids = collectVisibleSubtreeIds(data, group.childId, linksByGroup);
      for (const parentId of parentIds) ids.delete(parentId);
      shiftPositions(positions, ids, dy);
    });
  }
}
function resolveSiblingSubtreeOverlaps(data, positions, linksByGroup, card) {
  const decedentId = data.caseInfo?.decedentPersonId || data.people[0]?.personId || null;
  const minGap = Math.max(18, card.h * 0.24);
  for (let pass = 0; pass < 12; pass += 1) {
    let changed = false;
    for (const cluster of buildParentClusters(data, linksByGroup)) {
      const parentIds = new Set(cluster.parentIds || []);
      const branches = cluster.groups
        .filter((group) => group.diagramVisibility !== "hidden" && positions.has(group.childId))
        .sort((a, b) => {
          if (a.childId === decedentId && b.childId !== decedentId) return -1;
          if (b.childId === decedentId && a.childId !== decedentId) return 1;
          return compareChildConnectionGroup(a, b);
        })
        .map((group) => {
          const ids = collectVisibleSubtreeIds(data, group.childId, linksByGroup);
          for (const parentId of parentIds) ids.delete(parentId);
          return ids;
        });
      const fixed = [];
      for (const ids of branches) {
        const dy = printBranchRequiredShift(positions, fixed, ids, card, minGap);
        if (dy > 0) {
          shiftPositions(positions, ids, dy);
          changed = true;
        }
        fixed.push(ids);
      }
    }
    if (!changed) break;
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

function clampSpouseRelationGaps(data, positions, card = CARD_NORMAL) {
  for (const relation of data.spouseRelations.slice().sort(compareSpouseForLayout)) {
    const anchorId = spouseLayoutAnchorId(data, relation);
    const otherId = otherSpouseId(relation, anchorId);
    const anchor = positions.get(anchorId);
    const other = positions.get(otherId);
    if (!anchor || !other || Math.abs(anchor.x - other.x) >= 10) continue;
    const generation = Math.round((anchor.x - generationX(0)) / GAP_X);
    const slotIndex = spouseRelationSlotIndex(data, relation, anchorId);
    const offset = spousePlacementOffset(slotIndex, generation);
    const expectedGap = Math.abs(offset) * GAP_Y;
    if (Math.abs(Math.abs(anchor.y - other.y) - expectedGap) < 1 || mayKeepExpandedPrintSpouseGap(data, positions, relation, card)) continue;
    other.y = chooseOpenSpouseY(positions, anchor, otherId, offset, GAP_Y, GAP_Y);
  }
}

function mayKeepExpandedPrintSpouseGap(data, positions, relation, card) {
  const childIds = data.parentGroups
    .filter((group) => group.spouseRelationId === relation.spouseRelationId && group.diagramVisibility !== "hidden")
    .map((group) => group.childId);
  if (childIds.length === 0) return false;
  for (const anchorId of [relation.person1Id, relation.person2Id]) {
    if (getSpouseRelations(data, anchorId).length < 2) continue;
    for (const otherRelation of getSpouseRelations(data, anchorId)) {
      if (otherRelation.spouseRelationId === relation.spouseRelationId) continue;
      const otherChildren = data.parentGroups
        .filter((group) => group.spouseRelationId === otherRelation.spouseRelationId && group.diagramVisibility !== "hidden")
        .map((group) => group.childId);
      for (const childId of childIds) {
        const child = positions.get(childId);
        if (!child) continue;
        for (const otherChildId of otherChildren) {
          const otherChild = positions.get(otherChildId);
          if (otherChild && Math.abs(child.y - otherChild.y) < card.h + Math.max(18, GAP_Y * 0.3)) return true;
        }
      }
    }
  }
  return false;
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
    const offset = spousePlacementOffset(slotIndex, generation);
    other.y = chooseOpenSpouseY(positions, anchor, otherId, offset, GAP_Y, GAP_Y);
  }
}


function chooseOpenSpouseY(positions, anchor, movingId, preferredOffset, gap, minDistance) {
  return anchor.y + preferredOffset * gap;
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

function separateSpouseParentFamilies(data, positions, linksByGroup, card) {
  const minGap = Math.max(18, card.h * 0.24);
  for (const relation of data.spouseRelations.slice().sort(compareSpouseForLayout)) {
    const anchorId = spouseLayoutAnchorId(data, relation);
    const otherId = otherSpouseId(relation, anchorId);
    const anchor = positions.get(anchorId);
    const other = positions.get(otherId);
    if (!anchor || !other || Math.abs(anchor.x - other.x) >= 10) continue;
    const fixedIds = parentAncestorBranchIds(data, anchorId, linksByGroup);
    const movingParentIds = parentAncestorBranchIds(data, otherId, linksByGroup);
    const slotIndex = spouseRelationSlotIndex(data, relation, anchorId);
    const generation = spouseRelationGeneration(relation, positions);
    const offset = spousePlacementOffset(slotIndex, generation);
    const direction = offset >= 0 ? 1 : -1;
    const movingIds = new Set(movingParentIds);
    movingIds.add(otherId);
    const slotShortfall = Math.abs(offset) * GAP_Y - direction * (other.y - anchor.y);
    if (slotShortfall > 0) shiftPositions(positions, movingIds, direction * slotShortfall);
    if (fixedIds.size === 0 || movingParentIds.size === 0 || setsShareIds(fixedIds, movingParentIds)) continue;
    const required = direction > 0
      ? printBranchRequiredShift(positions, [fixedIds], movingParentIds, card, minGap)
      : printBranchRequiredUpShift(positions, fixedIds, movingParentIds, card, minGap);
    if (required > 0) shiftPositions(positions, movingIds, direction * required);
  }
}

function parentAncestorBranchIds(data, childId, linksByGroup) {
  const ids = new Set();
  for (const group of data.parentGroups) {
    if (group.childId !== childId || group.diagramVisibility === "hidden") continue;
    for (const link of linksByGroup.get(group.parentGroupId) || []) {
      collectAncestorBranchIds(data, link.parentId, linksByGroup, ids);
    }
  }
  ids.delete(childId);
  return ids;
}

function printBranchRequiredUpShift(positions, fixedIds, movingIds, card, minGap) {
  let required = 0;
  for (const fixedId of fixedIds) {
    const fixed = positions.get(fixedId);
    if (!fixed) continue;
    for (const movingId of movingIds) {
      const moving = positions.get(movingId);
      if (!moving) continue;
      const horizontalOverlap = Math.abs(fixed.x - moving.x) < card.w + 12;
      const verticalOverlap = Math.abs(fixed.y - moving.y) < card.h + minGap;
      if (!horizontalOverlap || !verticalOverlap) continue;
      required = Math.max(required, moving.y + card.h / 2 + minGap / 2 - (fixed.y - card.h / 2 - minGap / 2));
    }
  }
  return Math.ceil(required);
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
    const biologicalGroups = visibleGroups.filter((group) => group.groupKind !== "adoptive");
    const onlyGroup = visibleGroups.length === 1 ? visibleGroups[0] : null;
    const hasBiologicalParentsElsewhere = onlyGroup && data.parentGroups.some((group) =>
      group.childId === onlyGroup.childId && group.diagramVisibility !== "hidden" && group.groupKind !== "adoptive"
    );
    const directGroup = biologicalGroups[0] || (onlyGroup && !hasBiologicalParentsElsewhere ? onlyGroup : null);
    if (!directGroup) continue;
    const child = positions.get(directGroup.childId);
    if (!child || (parents.length === 1 && directGroup.groupKind === "adoptive")) continue;
    const targetY = average(parents.map((parent) => parent.pos.y));
    const dy = targetY - child.y;
    if (Math.abs(dy) < 1) continue;
    const ids = collectVisibleSubtreeIds(data, directGroup.childId, linksByGroup);
    for (const parentId of cluster.parentIds) ids.delete(parentId);
    for (const relation of getSpouseRelations(data, directGroup.childId)) {
      const spouseId = otherSpouseId(relation, directGroup.childId);
      if (data.parentGroups.some((group) => group.childId === spouseId && group.diagramVisibility !== "hidden")) ids.delete(spouseId);
    }
    shiftPositions(positions, ids, dy);
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

function resolveFinalCardRectOverlaps(data, positions, linksByGroup, card) {
  for (let pass = 0; pass < 160; pass += 1) {
    const pair = findOverlappingCardPair(positions, card, 12, 12);
    if (!pair) return true;
    const lower = chooseLowerOverlapEntry(data, pair);
    const upper = lower === pair.a ? pair.b : pair.a;
    let ids = collectSiblingBlockIds(data, lower.personId, positions);
    if (ids.has(upper.personId)) ids = new Set([lower.personId]);
    const bounds = subtreeBounds(positions, ids, card);
    if (!bounds) continue;
    const minY = upper.rect.bottom + Math.max(16, card.h * 0.2);
    const dy = Math.max(card.h * 0.5, minY - bounds.minY);
    shiftPositions(positions, ids, dy);
  }
  return false;
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

function arrangeMultipleParentGroupBands(data, positions, linksByGroup, card) {
  const groupsByChild = groupBy(
    data.parentGroups.filter((group) => group.diagramVisibility !== "hidden" && positions.has(group.childId)),
    "childId"
  );
  for (const [childId, groups] of groupsByChild.entries()) {
    if (groups.length < 2) continue;
    const child = positions.get(childId);
    const orderedGroups = groups.slice().sort(compareChildConnectionGroup);
    let previousBottom = null;
    const usedIds = new Set();
    for (const group of orderedGroups) {
      const parentIds = (linksByGroup.get(group.parentGroupId) || [])
        .map((link) => link.parentId)
        .filter((parentId) => positions.has(parentId));
      if (parentIds.length === 0 || parentIds.some((parentId) => usedIds.has(parentId))) continue;
      const halfSpan = card.h / 2 + Math.max(0, parentIds.length - 1) * GAP_Y / 2;
      const targetCenter = previousBottom === null
        ? child.y
        : previousBottom + Math.max(18, card.h * 0.24) + halfSpan;
      const currentCenter = average(parentIds.map((parentId) => positions.get(parentId).y));
      const branchIds = new Set();
      for (const parentId of parentIds) collectAncestorBranchIds(data, parentId, linksByGroup, branchIds);
      branchIds.delete(childId);
      shiftPositions(positions, branchIds, targetCenter - currentCenter);
      for (const parentId of parentIds) usedIds.add(parentId);
      previousBottom = targetCenter + halfSpan;
    }
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
      const minTop = floor + Math.max(18, card.h * 0.24);
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
  const adjacency = new Map(items.map((item) => [item.id, new Set()]));
  if (data) {
    for (const relation of data.spouseRelations) {
      const first = byId.get(relation.person1Id);
      const second = byId.get(relation.person2Id);
      if (!first || !second || Math.abs(first.pos.x - second.pos.x) >= 10) continue;
      adjacency.get(relation.person1Id).add(relation.person2Id);
      adjacency.get(relation.person2Id).add(relation.person1Id);
    }
  }
  const used = new Set();
  const blocks = [];
  for (const item of items) {
    if (used.has(item.id)) continue;
    const component = [];
    const stack = [item.id];
    while (stack.length > 0) {
      const personId = stack.pop();
      if (used.has(personId)) continue;
      used.add(personId);
      component.push(byId.get(personId));
      for (const otherId of adjacency.get(personId) || []) stack.push(otherId);
    }
    blocks.push(columnBlock(component, card));
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
  const roots = data.people
    .filter((person) => !data.parentGroups.some((group) => group.childId === person.personId))
    .sort((a, b) => (positions.get(a.personId)?.y || 0) - (positions.get(b.personId)?.y || 0));
  const fixed = [];
  for (const root of roots) {
    const ids = collectVisibleSubtreeIds(data, root.personId, linksByGroup);
    if (fixed.some((other) => setsShareIds(other, ids))) continue;
    const dy = printBranchRequiredShift(positions, fixed, ids, card, Math.max(18, card.h * 0.24));
    if (dy > 0) shiftPositions(positions, ids, dy);
    fixed.push(ids);
  }
}

function setsShareIds(a, b) {
  for (const id of a) if (b.has(id)) return true;
  return false;
}

function printBranchRequiredShift(positions, fixedBranches, movingIds, card, minGap) {
  let required = 0;
  for (const fixedIds of fixedBranches) {
    for (const fixedId of fixedIds) {
      const fixed = positions.get(fixedId);
      if (!fixed) continue;
      for (const movingId of movingIds) {
        const moving = positions.get(movingId);
        if (!moving) continue;
        const horizontalOverlap = Math.abs(fixed.x - moving.x) < card.w + 18;
        const verticalOverlap = Math.abs(fixed.y - moving.y) < card.h + minGap;
        if (!horizontalOverlap || !verticalOverlap) continue;
        required = Math.max(required, fixed.y + card.h / 2 + minGap / 2 - (moving.y - card.h / 2 - minGap / 2));
      }
    }
  }
  return Math.ceil(required);
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

function enforceGenerationColumns(positions, generations) {
  for (const [personId, pos] of positions.entries()) {
    const generation = generations.get(personId);
    if (generation !== undefined) pos.x = generationX(generation);
  }
}
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
    if (!p1 || !p2 || Math.abs(p1.x - p2.x) >= 10) continue;
    drawSpouseConnector(layer, p1, p2, layout.card, relation, layout.positions);
  }
}

function drawSpouseConnector(layer, p1, p2, card, relation, positions) {
  const adjacent = !hasCardBetweenSameColumn(positions, p1, p2, card);
  if (adjacent) {
    const x = p1.x;
    const top = Math.min(p1.y, p2.y) + card.h / 2;
    const bottom = Math.max(p1.y, p2.y) - card.h / 2;
    drawVerticalSpouseLine(layer, x, top, bottom, relation);
    if (relation.spouseStatus === "divorced") drawDivorceMark(layer, x - 18, (top + bottom) / 2);
    return;
  }
  const start = spouseSidePoint(p1, card, relation, positions);
  const end = spouseSidePoint(p2, card, relation, positions);
  const busX = Math.min(p1.x, p2.x) - card.w / 2 - 24 - Math.abs(start.offset) * 0.8;
  drawSpousePath(layer, `M ${start.x} ${start.y} H ${busX} V ${end.y} H ${end.x}`, relation);
  if (relation.spouseStatus === "divorced") drawDivorceMark(layer, busX - 18, (start.y + end.y) / 2);
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
  const plan = planParentChildLines(data, layout, layout.linksByGroup);
  const parentSetSegments = plan.parentSetLines.map((line) => parentSetVerticalSegment(line.p1, line.p2, layout.card));
  const verticalSegments = collectSpouseVerticalSegments(data, layout).concat(parentSetSegments, plan.verticalSegments);
  for (const line of plan.parentSetLines) drawParentSetLine(layer, line.p1, line.p2, layout.card);
  for (const segment of plan.verticalSegments) {
    layer.appendChild(svgEl("line", { class: `connector${segment.allAdoptive ? " adoptive" : ""}`, x1: segment.x, y1: segment.y1, x2: segment.x, y2: segment.y2 }));
  }
  for (const path of plan.paths) {
    if (path.kind === "label") {
      drawText(layer, path.label, path.labelX, path.labelY, "relation-label", "start");
      continue;
    }
    const d = path.kind === "horizontal" ? horizontalPathWithJumps(path.x1, path.y, path.x2, verticalSegments, path.skipX) : `M ${path.x1} ${path.y1} V ${path.y2}${horizontalContinuationWithJumps(path.x1, path.y2, path.x2, verticalSegments, path.skipX)}`;
    layer.appendChild(svgEl("path", { class: `connector${path.adoptive ? " adoptive" : ""}`, d }));
  }
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
  const groups = data.parentGroups
    .filter((item) => item.childId === group.childId && item.diagramVisibility !== "hidden")
    .sort((a, b) => parentGroupSourceY(data, layout, a) - parentGroupSourceY(data, layout, b) || compareChildConnectionGroup(a, b));
  const index = Math.max(0, groups.findIndex((item) => item.parentGroupId === group.parentGroupId));
  return baseY + centeredOffset(index, groups.length, 14);
}

function parentGroupSourceY(data, layout, group) {
  const links = layout.linksByGroup.get(group.parentGroupId) || [];
  const positions = links.map((link) => layout.positions.get(link.parentId)).filter(Boolean);
  return positions.length ? average(positions.map((pos) => pos.y)) : 0;
}

function parentSourceOffset(data, layout, group, mixedKinds) {
  const sameChildGroups = data.parentGroups.filter((item) => item.childId === group.childId && item.diagramVisibility !== "hidden");
  if (sameChildGroups.length <= 1) return 0;
  const ordered = sameChildGroups.slice().sort((a, b) => parentGroupSourceY(data, layout, a) - parentGroupSourceY(data, layout, b) || compareChildConnectionGroup(a, b));
  const index = Math.max(0, ordered.findIndex((item) => item.parentGroupId === group.parentGroupId));
  const sourceOrderOffset = centeredOffset(index, ordered.length, 14);
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















