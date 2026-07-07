"use strict";

const SVG_NS = "http://www.w3.org/2000/svg";
const CARD = { w: 184, h: 76 };
const X_GAP = 330;
const SPOUSE_GAP = 132;
const CHILD_GAP = 132;
const ROW_GAP = 116;
const MARGIN = 120;
const DEFAULT_PRINT_SETTINGS = { paper: "A4", orientation: "landscape", printMode: "normal", fitToOnePage: true };
const state = { caseData: null, selectedPersonId: null, zoom: 1, lastLayout: null, detailMode: "view", undoSnapshot: null };
const els = {};

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  setupMonthOptions();
  bindEvents();
  restoreCaseAfterPrint();
});

function bindElements() {
  for (const id of ["startScreen", "appScreen", "caseMonthInput", "caseSerialInput", "decedentFamilyNameInput", "decedentGivenNameInput", "decedentGenderInput", "decedentDeathDateInput", "startError", "createCaseButton", "startLoadJsonButton", "caseSubtitle", "exportJsonButton", "loadJsonButton", "undoButton", "printButton", "resetButton", "zoomOutButton", "zoomResetButton", "zoomInButton", "centerDecedentButton", "graphInfo", "svgScroll", "diagramSvg", "detailContent", "jsonFileInput", "loadingOverlay", "loadingSteps"]) {
    els[id] = document.getElementById(id);
  }
  els.svg = els.diagramSvg;
}

function setupMonthOptions() {
  for (let month = 1; month <= 13; month += 1) {
    const option = document.createElement("option");
    option.value = String(month);
    option.textContent = month === 13 ? "13（例月外）" : String(month);
    els.caseMonthInput.appendChild(option);
  }
}

function bindEvents() {
  els.createCaseButton.addEventListener("click", createInitialCaseFromForm);
  els.startLoadJsonButton.addEventListener("click", () => requestLoadJson(true));
  els.loadJsonButton.addEventListener("click", () => requestLoadJson(false));
  els.exportJsonButton.addEventListener("click", exportJson);
  els.undoButton.addEventListener("click", undoLastOperation);
  els.printButton.addEventListener("click", openPrintPage);
  els.resetButton.addEventListener("click", resetToStart);
  els.zoomOutButton.addEventListener("click", () => setZoom(Math.max(0.5, state.zoom - 0.1)));
  els.zoomResetButton.addEventListener("click", () => setZoom(1));
  els.zoomInButton.addEventListener("click", () => setZoom(Math.min(1.8, state.zoom + 0.1)));
  els.centerDecedentButton.addEventListener("click", () => centerPerson(currentCase()?.caseInfo?.decedentPersonId));
  bindWarekiDateInput(els.decedentDeathDateInput);
  els.jsonFileInput.addEventListener("change", handleJsonFileSelected);
}

function createInitialCaseFromForm() {
  const errors = [];
  const month = Number(els.caseMonthInput.value);
  const serialText = els.caseSerialInput.value.trim();
  const familyName = els.decedentFamilyNameInput.value.trim();
  const givenName = els.decedentGivenNameInput.value.trim();
  if (!Number.isInteger(month) || month < 1 || month > 13) errors.push("管理番号（月）は1〜13を選んでください。");
  if (!/^\d+$/.test(serialText) || Number(serialText) < 1) errors.push("管理番号（連番）は1以上の数字で入力してください。");
  if (!familyName && !givenName) errors.push("被相続人の姓または名のどちらかを入力してください。");
  if (errors.length > 0) return showStartError(errors);
  hideStartError();
  const caseNo = `${month}-${Number(serialText)}`;
  const decedent = makePerson({
    personId: "p001",
    familyName,
    givenName,
    gender: els.decedentGenderInput.value,
    lifeStatus: "deceased",
    relationshipLabel: "被相続人",
    heirStatus: "unset",
    deathDateWarekiCode: warekiDateInputCode(els.decedentDeathDateInput),
    researchStatus: "checking"
  });
  const now = new Date().toISOString();
  openCase({
    caseInfo: { caseNo, caseTitle: `${caseNo} ${displayName(decedent)}`, decedentPersonId: decedent.personId, createdAt: now, updatedAt: now, toolVersion: "ver12-prototype", memo: "ver12プロトタイプで作成" },
    people: [decedent],
    parentGroups: [],
    parentLinks: [],
    spouseRelations: [],
    printSettings: { ...DEFAULT_PRINT_SETTINGS }
  }, decedent.personId, true);
}

function makePerson(values) {
  return {
    personId: values.personId,
    nameInputType: "split",
    familyName: values.familyName || "",
    givenName: values.givenName || "",
    fullName: "",
    isUnknownPerson: false,
    gender: values.gender || "unset",
    lifeStatus: values.lifeStatus || "unset",
    birthDateWarekiCode: values.birthDateWarekiCode || "",
    deathDateWarekiCode: values.deathDateWarekiCode || "",
    relationshipLabel: values.relationshipLabel || "",
    heirStatus: values.heirStatus || "unset",
    researchStatus: values.researchStatus || "unset",
    note: ""
  };
}

function showStartError(errors) { els.startError.hidden = false; els.startError.innerHTML = errors.map(escapeHtml).join("<br>"); }
function hideStartError() { els.startError.hidden = true; els.startError.textContent = ""; }
function currentCase() { return state.caseData; }

function openCase(caseData, selectedPersonId, centerDecedent) {
  normalizeCaseData(caseData);
  state.caseData = caseData;
  state.selectedPersonId = selectedPersonId || caseData.caseInfo.decedentPersonId || caseData.people[0]?.personId || null;
  state.zoom = 1;
  state.detailMode = "view";
  state.undoSnapshot = null;
  els.startScreen.hidden = true;
  els.appScreen.hidden = false;
  render(centerDecedent);
}

function normalizeCaseData(caseData) {
  if (!caseData.printSettings) caseData.printSettings = { ...DEFAULT_PRINT_SETTINGS };
  caseData.people = Array.isArray(caseData.people) ? caseData.people : [];
  caseData.parentGroups = Array.isArray(caseData.parentGroups) ? caseData.parentGroups : [];
  caseData.parentLinks = Array.isArray(caseData.parentLinks) ? caseData.parentLinks : [];
  caseData.spouseRelations = Array.isArray(caseData.spouseRelations) ? caseData.spouseRelations : [];
  if (!caseData.caseInfo) caseData.caseInfo = {};
  caseData.caseInfo.toolVersion ||= "ver12-prototype";
  caseData.caseInfo.updatedAt = new Date().toISOString();
}

function resetToStart() {
  if (state.caseData && !confirm("現在の入力中データは破棄されます。初期画面に戻ってよろしいですか？")) return;
  state.caseData = null;
  state.selectedPersonId = null;
  state.detailMode = "view";
  state.zoom = 1;
  state.lastLayout = null;
  state.undoSnapshot = null;
  els.svg.replaceChildren();
  els.detailContent.replaceChildren();
  els.appScreen.hidden = true;
  els.startScreen.hidden = false;
}

function setZoom(zoom) { state.zoom = Number(zoom.toFixed(2)); render(false); }

function render(centerDecedent = false) {
  const caseData = currentCase();
  if (!caseData) return;
  updateCaseTitle(caseData);
  const layout = computeLayout(caseData);
  state.lastLayout = layout;
  renderSvg(caseData, layout);
  renderGraphInfo(caseData);
  if (els.undoButton) els.undoButton.disabled = !state.undoSnapshot;
  renderDetail(caseData);
  if (centerDecedent) requestAnimationFrame(() => centerPerson(caseData.caseInfo.decedentPersonId));
}

function updateCaseTitle(caseData) {
  const decedent = caseData.people.find((p) => p.personId === caseData.caseInfo.decedentPersonId);
  caseData.caseInfo.caseTitle = `${caseData.caseInfo.caseNo || "管理番号未設定"} ${displayName(decedent)}`.trim();
  els.caseSubtitle.textContent = `${caseData.caseInfo.caseTitle} / ${caseData.people.length}人`;
}

function renderGraphInfo(caseData) { els.graphInfo.textContent = `${caseData.caseInfo.caseTitle} / 関係図作成画面 / ${Math.round(state.zoom * 100)}%`; }
function openPrintPage() {
  if (!state.caseData) return;
  sessionStorage.setItem("souzokuPrintCaseData", JSON.stringify(state.caseData));
  window.location.href = "print.html";
}

function restoreCaseAfterPrint() {
  if (sessionStorage.getItem("souzokuReturnFromPrint") !== "1") return;
  const raw = sessionStorage.getItem("souzokuPrintCaseData");
  sessionStorage.removeItem("souzokuReturnFromPrint");
  if (!raw) return;
  try {
    const restored = JSON.parse(raw);
    openCase(restored, restored.caseInfo?.decedentPersonId, true);
  } catch (error) {
    console.warn("印刷画面からの復元に失敗しました", error);
  }
}

function computeLayout(caseData) {
  const peopleById = mapBy(caseData.people, "personId");
  const linksByGroup = groupBy(caseData.parentLinks, "parentGroupId");
  const generations = layoutGenerationMap(caseData, linksByGroup);
  const positions = new Map();
  const decedentId = caseData.caseInfo.decedentPersonId || caseData.people[0]?.personId;
  if (decedentId) positions.set(decedentId, { x: generationX(generations.get(decedentId) || 0), y: 420 });
  for (let i = 0; i < 8; i += 1) {
    placeSpouses(caseData, positions, generations, linksByGroup);
    placeParentsForKnownChildren(caseData, positions, linksByGroup, generations);
    placeChildrenForKnownParents(caseData, positions, linksByGroup, peopleById, generations);
  }
  resolveColumnOverlaps(caseData, positions, generations);
  resolveRootSubtreeOverlaps(caseData, positions, linksByGroup, generations);
  for (let i = 0; i < 3; i += 1) {
    enforceFirstChildMidpointAlignment(caseData, positions, linksByGroup, peopleById);
    expandSpouseGapsForParentPairs(caseData, positions, linksByGroup);
    separateSiblingChildrenAfterAlignment(caseData, positions, linksByGroup, peopleById);
  }
  enforceFirstChildMidpointAlignment(caseData, positions, linksByGroup, peopleById);
  separateSiblingChildrenAfterAlignment(caseData, positions, linksByGroup, peopleById);
  resolveSiblingSubtreeOverlaps(caseData, positions, linksByGroup, peopleById);
  resolveSpouseLineIntrusions(caseData, positions, linksByGroup);
  resolveColumnOverlaps(caseData, positions, generations);
  enforceFirstChildMidpointAlignment(caseData, positions, linksByGroup, peopleById);
  separateSiblingChildrenAfterAlignment(caseData, positions, linksByGroup, peopleById);
  normalizeChildlessSpouseSlots(caseData, positions);
  for (let i = 0; i < 4; i += 1) {
    alignDirectFirstChildConnections(caseData, positions, linksByGroup, peopleById);
    resolveSpouseParentBranchOverlaps(caseData, positions, linksByGroup);
    resolveSpouseLineIntrusions(caseData, positions, linksByGroup);
    clampSpouseRelationGaps(caseData, positions);
    resolveSiblingSubtreeOverlaps(caseData, positions, linksByGroup, peopleById);
  }
  alignDirectFirstChildConnections(caseData, positions, linksByGroup, peopleById);
  resolveSpouseParentBranchOverlaps(caseData, positions, linksByGroup);
  clampSpouseRelationGaps(caseData, positions);
  alignDirectFirstChildConnections(caseData, positions, linksByGroup, peopleById);
  alignSingleAdoptiveChildrenNearParent(caseData, positions, linksByGroup, ROW_GAP);
  enforceFirstChildMidpointAlignment(caseData, positions, linksByGroup, peopleById);
  separateSiblingChildrenAfterAlignment(caseData, positions, linksByGroup, peopleById);
  clampSpouseRelationGaps(caseData, positions);
  alignDirectFirstChildConnections(caseData, positions, linksByGroup, peopleById);
  compactParentChildDistances(caseData, positions, linksByGroup, peopleById);
  resolveAllCardOverlaps(caseData, positions, linksByGroup);
  compactParentChildDistances(caseData, positions, linksByGroup, peopleById);
  resolveAllCardOverlaps(caseData, positions, linksByGroup);
  clampSpouseRelationGaps(caseData, positions);
  alignDirectFirstChildConnections(caseData, positions, linksByGroup, peopleById);
  compactParentChildDistances(caseData, positions, linksByGroup, peopleById);
  resolveAllCardOverlaps(caseData, positions, linksByGroup);
  clampSpouseRelationGaps(caseData, positions);
  preserveDecedentDirectFirstChildAlignment(caseData, positions, linksByGroup, peopleById);
  preserveDecedentAsFirstChildFromParentsAlignment(caseData, positions, linksByGroup);
  resolveSiblingBranchSubtreeBands(caseData, positions, linksByGroup, peopleById);
  resolveFinalCardRectOverlaps(caseData, positions, linksByGroup);
  placeRemainingPeople(caseData, positions);
  resolveFinalCardRectOverlaps(caseData, positions, linksByGroup);
  normalizePositions(positions);
  const bounds = getBounds(positions);
  return { positions, generations, card: CARD, width: Math.max(1200, bounds.maxX + MARGIN), height: Math.max(760, bounds.maxY + MARGIN) };
}

function layoutGenerationMap(caseData, linksByGroup) {
  const generations = new Map();
  const decedentId = caseData.caseInfo.decedentPersonId || caseData.people[0]?.personId;
  if (decedentId) generations.set(decedentId, 0);
  for (let pass = 0; pass < 12; pass += 1) {
    let changed = false;
    for (const relation of caseData.spouseRelations) {
      const g1 = generations.get(relation.person1Id);
      const g2 = generations.get(relation.person2Id);
      if (g1 !== undefined && g2 === undefined) { generations.set(relation.person2Id, g1); changed = true; }
      if (g2 !== undefined && g1 === undefined) { generations.set(relation.person1Id, g2); changed = true; }
    }
    for (const group of caseData.parentGroups) {
      if (group.diagramVisibility === "hidden") continue;
      const parentIds = (linksByGroup.get(group.parentGroupId) || []).map((link) => link.parentId);
      const parentGenerations = parentIds.map((id) => generations.get(id)).filter((value) => value !== undefined);
      const childGeneration = generations.get(group.childId);
      if (parentGenerations.length > 0 && childGeneration === undefined) {
        generations.set(group.childId, Math.max(...parentGenerations) + 1);
        changed = true;
      } else if (childGeneration !== undefined) {
        for (const parentId of parentIds) {
          if (generations.get(parentId) === undefined) {
            generations.set(parentId, childGeneration - 1);
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }
  return generations;
}

function generationX(generation) { return 700 + generation * X_GAP; }

function placeSpouses(caseData, positions, generations, linksByGroup) {
  for (const person of caseData.people) {
    const anchor = positions.get(person.personId);
    if (!anchor) continue;
    const relations = getSpouseRelations(caseData, person.personId).slice().sort(compareSpouseForLayout);
    relations.forEach((relation, index) => {
      const otherId = otherSpouseId(relation, person.personId);
      if (positions.has(otherId)) return;
      const generation = generations.get(person.personId) ?? generations.get(otherId) ?? 0;
      const gap = spouseLayoutGap(caseData, relation, linksByGroup, generation);
      positions.set(otherId, { x: generationX(generation), y: anchor.y + spousePlacementOffset(index, generation) * gap });
    });
  }
}

function spouseLayoutGap(caseData, relation, linksByGroup, generation) {
  return SPOUSE_GAP;
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

function placeChildrenForKnownParents(caseData, positions, linksByGroup, peopleById, generations) {
  for (const cluster of buildParentClusters(caseData, linksByGroup)) {
    const parentPositions = cluster.parentIds.map((id) => positions.get(id)).filter(Boolean);
    if (parentPositions.length === 0) continue;
    const parentGenerations = cluster.parentIds.map((id) => generations.get(id)).filter((value) => value !== undefined);
    const childGeneration = parentGenerations.length > 0 ? Math.max(...parentGenerations) + 1 : 1;
    const centerY = average(parentPositions.map((p) => p.y));
    const sortedGroups = cluster.groups.slice().sort((a, b) => compareChildGroups(a, b, peopleById));
    const usedRanges = usedYRangesForGeneration(positions, generations, childGeneration);
    const protectedRanges = spouseProtectedYRanges(caseData, positions, generations, childGeneration);
    sortedGroups.forEach((group, index) => {
      if (positions.has(group.childId)) return;
      const preferredY = centerY + index * ROW_GAP;
      const y = chooseOpenChildY(preferredY, ROW_GAP, usedRanges, protectedRanges);
      positions.set(group.childId, { x: generationX(childGeneration), y });
      usedRanges.push(centeredRange(y, ROW_GAP));
    });
  }
}

function parentGroupCenterY(caseData, positions, peopleById, group) {
  const childPos = positions.get(group.childId);
  if (!childPos) return null;
  const groups = caseData.parentGroups
    .filter((item) => item.childId === group.childId && item.diagramVisibility !== "hidden" && positions.has(item.childId))
    .sort((a, b) => compareChildConnectionGroup(a, b) || compareChildGroups(a, b, peopleById));
  const index = Math.max(0, groups.findIndex((item) => item.parentGroupId === group.parentGroupId));
  return childPos.y + centeredOffset(index, groups.length, SPOUSE_GAP + ROW_GAP);
}

function firstVisibleGroupForCluster(cluster, positions, peopleById) {
  return cluster.groups
    .filter((group) => group.diagramVisibility !== "hidden" && positions.has(group.childId))
    .sort((a, b) => compareChildGroups(a, b, peopleById))[0] || null;
}
function enforceFirstChildMidpointAlignment(caseData, positions, linksByGroup, peopleById) {
  const clusters = buildParentClusters(caseData, linksByGroup)
    .map((cluster) => {
      const parents = cluster.parentIds.map((parentId) => ({ parentId, pos: positions.get(parentId) })).filter((item) => item.pos);
      const firstGroup = firstVisibleGroupForCluster(cluster, positions, peopleById);
      const centerY = firstGroup ? parentGroupCenterY(caseData, positions, peopleById, firstGroup) : null;
      return { cluster, parents, firstGroup, centerY };
    })
    .filter((item) => item.parents.length > 0 && item.centerY !== null)
    .sort((a, b) => positions.get(b.firstGroup.childId).x - positions.get(a.firstGroup.childId).x);
  const childrenWithParentPairs = new Set(clusters.filter((item) => item.parents.length === 2).map((item) => item.firstGroup.childId));
  for (const item of clusters) {
    if (item.parents.length === 1) {
      if (item.firstGroup.groupKind === "adoptive") continue;
      item.parents[0].pos.y = item.centerY;
      continue;
    }
    if (item.parents.length !== 2) continue;
    const orderedParents = orderParentPairForStableSpouseSlot(caseData, item.parents, positions);
    const parentGap = childrenWithParentPairs.has(orderedParents[0].parentId) && childrenWithParentPairs.has(orderedParents[1].parentId) ? SPOUSE_GAP * 2 : SPOUSE_GAP;
    orderedParents[0].pos.y = item.centerY - parentGap / 2;
    orderedParents[1].pos.y = item.centerY + parentGap / 2;
  }
}

function expandSpouseGapsForParentPairs(caseData, positions, linksByGroup) {
  for (const relation of caseData.spouseRelations) {
    const p1 = positions.get(relation.person1Id);
    const p2 = positions.get(relation.person2Id);
    if (!p1 || !p2 || Math.abs(p1.x - p2.x) >= 10) continue;
    const desiredGap = SPOUSE_GAP;
    const currentGap = Math.abs(p1.y - p2.y);
    if (Math.abs(currentGap - desiredGap) < 1) continue;
    const direction = p2.y >= p1.y ? 1 : -1;
    const centerY = average([p1.y, p2.y]);
    p1.y = centerY - direction * desiredGap / 2;
    p2.y = centerY + direction * desiredGap / 2;
  }
}
function separateSiblingChildrenAfterAlignment(caseData, positions, linksByGroup, peopleById) {
  for (const cluster of buildParentClusters(caseData, linksByGroup)) {
    const children = cluster.groups
      .filter((group) => group.diagramVisibility !== "hidden" && positions.has(group.childId))
      .sort((a, b) => compareChildGroups(a, b, peopleById));
    if (children.length <= 1) continue;
    const firstY = positions.get(children[0].childId).y;
    let aboveCount = 0;
    let belowCount = 0;
    for (const group of children.slice(1)) {
      const pos = positions.get(group.childId);
      const placeAbove = pos.y < firstY;
      if (placeAbove) {
        aboveCount += 1;
        pos.y = firstY - aboveCount * ROW_GAP;
      } else {
        belowCount += 1;
        pos.y = firstY + belowCount * ROW_GAP;
      }
    }
  }
}

function parentSideSpan(caseData, positions, linksByGroup, personId) {
  const parentGroups = caseData.parentGroups.filter((group) => group.childId === personId && group.diagramVisibility !== "hidden");
  if (parentGroups.length === 0) return ROW_GAP;
  let top = Infinity;
  let bottom = -Infinity;
  for (const group of parentGroups) {
    const links = linksByGroup.get(group.parentGroupId) || [];
    for (const link of links) {
      const ids = collectVisibleSubtreeIds(caseData, link.parentId, linksByGroup);
      const bounds = subtreeBounds(positions, ids);
      if (!bounds) continue;
      top = Math.min(top, bounds.top);
      bottom = Math.max(bottom, bounds.bottom);
    }
  }
  return top === Infinity ? ROW_GAP : Math.max(ROW_GAP, bottom - top);
}

function collectSiblingBlockIds(caseData, childId, positions) {
  const ids = new Set([childId]);
  const child = positions.get(childId);
  if (!child) return ids;
  for (const relation of getSpouseRelations(caseData, childId)) {
    const otherId = otherSpouseId(relation, childId);
    const other = positions.get(otherId);
    if (other && Math.abs(other.x - child.x) < 10) ids.add(otherId);
  }
  return ids;
}

function resolveSiblingSubtreeOverlaps(caseData, positions, linksByGroup, peopleById) {
  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false;
    for (const cluster of buildParentClusters(caseData, linksByGroup)) {
      const children = cluster.groups
        .filter((group) => group.diagramVisibility !== "hidden" && positions.has(group.childId))
        .sort((a, b) => compareChildGroups(a, b, peopleById));
      let floor = -Infinity;
      for (const group of children) {
        const ids = collectSiblingBlockIds(caseData, group.childId, positions);
        const bounds = subtreeBounds(positions, ids);
        if (!bounds) continue;
        const minTop = floor + Math.max(28, CARD.h * 0.35);
        if (bounds.top < minTop) {
          const dy = minTop - bounds.top;
          shiftPositions(positions, ids, dy);
          bounds.bottom += dy;
          changed = true;
        }
        floor = Math.max(floor, bounds.bottom);
      }
    }
    if (!changed) break;
  }
}

function preserveDecedentDirectFirstChildAlignment(caseData, positions, linksByGroup, peopleById) {
  const decedentId = caseData.caseInfo?.decedentPersonId || caseData.people[0]?.personId || null;
  if (!decedentId || !positions.has(decedentId)) return;
  for (const cluster of buildParentClusters(caseData, linksByGroup)) {
    if (!cluster.parentIds.includes(decedentId)) continue;
    const parentPositions = cluster.parentIds.map((parentId) => positions.get(parentId)).filter(Boolean);
    if (parentPositions.length === 0) continue;
    const firstBiologicalGroup = cluster.groups
      .filter((group) => group.diagramVisibility !== "hidden" && group.groupKind !== "adoptive" && positions.has(group.childId))
      .sort((a, b) => compareChildGroups(a, b, peopleById))[0];
    if (!firstBiologicalGroup) continue;
    const childPos = positions.get(firstBiologicalGroup.childId);
    const targetY = average(parentPositions.map((pos) => pos.y));
    const dy = targetY - childPos.y;
    if (Math.abs(dy) < 1) continue;
    const ids = collectVisibleSubtreeIds(caseData, firstBiologicalGroup.childId, linksByGroup);
    for (const parentId of cluster.parentIds) ids.delete(parentId);
    shiftPositions(positions, ids, dy);
  }
}

function preserveDecedentAsFirstChildFromParentsAlignment(caseData, positions, linksByGroup) {
  const decedentId = caseData.caseInfo?.decedentPersonId || caseData.people[0]?.personId || null;
  const decedentPos = decedentId ? positions.get(decedentId) : null;
  if (!decedentPos) return;
  for (const cluster of buildParentClusters(caseData, linksByGroup)) {
    if (!cluster.groups.some((group) => group.diagramVisibility !== "hidden" && group.childId === decedentId)) continue;
    const parents = cluster.parentIds.map((parentId) => ({ parentId, pos: positions.get(parentId) })).filter((item) => item.pos);
    if (parents.length === 0) continue;
    if (parents.length === 1) {
      parents[0].pos.y = decedentPos.y;
      continue;
    }
    if (parents.length !== 2) continue;
    const orderedParents = orderParentPairForStableSpouseSlot(caseData, parents, positions);
    orderedParents[0].pos.y = decedentPos.y - SPOUSE_GAP / 2;
    orderedParents[1].pos.y = decedentPos.y + SPOUSE_GAP / 2;
  }
}

function resolveSiblingBranchSubtreeBands(caseData, positions, linksByGroup, peopleById) {
  const decedentId = caseData.caseInfo?.decedentPersonId || caseData.people[0]?.personId || null;
  const minGap = Math.max(28, CARD.h * 0.35);
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const cluster of buildParentClusters(caseData, linksByGroup)) {
      const parentIds = new Set(cluster.parentIds || []);
      const branches = cluster.groups
        .filter((group) => group.diagramVisibility !== "hidden" && positions.has(group.childId))
        .sort((a, b) => {
          if (a.childId === decedentId && b.childId !== decedentId) return -1;
          if (b.childId === decedentId && a.childId !== decedentId) return 1;
          return compareChildGroups(a, b, peopleById);
        })
        .map((group) => ({ group, ids: siblingBranchIds(caseData, group.childId, linksByGroup, parentIds) }))
        .filter((branch) => branch.ids.size > 0);
      const fixedBranches = [];
      for (const branch of branches) {
        const dy = siblingBranchRequiredShift(positions, fixedBranches, branch.ids, minGap);
        if (dy > 0) {
          shiftPositions(positions, branch.ids, dy);
          changed = true;
        }
        fixedBranches.push(branch.ids);
      }
    }
    if (!changed) break;
  }
}

function siblingBranchIds(caseData, childId, linksByGroup, parentIds) {
  const ids = collectVisibleSubtreeIds(caseData, childId, linksByGroup);
  for (const parentId of parentIds) ids.delete(parentId);
  return ids;
}

function siblingBranchRequiredShift(positions, fixedBranches, movingIds, minGap) {
  let required = 0;
  for (const fixedIds of fixedBranches) {
    for (const fixedId of fixedIds) {
      const fixedPos = positions.get(fixedId);
      if (!fixedPos) continue;
      const fixedRect = cardRect(fixedPos, CARD, 18, minGap);
      for (const movingId of movingIds) {
        const movingPos = positions.get(movingId);
        if (!movingPos) continue;
        const movingRect = cardRect(movingPos, CARD, 18, minGap);
        if (!rectsOverlap(fixedRect, movingRect)) continue;
        required = Math.max(required, fixedRect.bottom - movingRect.top);
      }
    }
  }
  return Math.ceil(required);
}

function resolveSpouseLineIntrusions(caseData, positions, linksByGroup) {
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const relation of caseData.spouseRelations.slice().sort(compareSpouseForLayout)) {
      const p1 = positions.get(relation.person1Id);
      const p2 = positions.get(relation.person2Id);
      if (!p1 || !p2 || Math.abs(p1.x - p2.x) >= 10) continue;
      const topY = Math.min(p1.y, p2.y);
      const bottomY = Math.max(p1.y, p2.y);
      const lowerLimit = bottomY + CARD.h / 2 + Math.max(28, ROW_GAP * 0.35);
      const protectedIds = spouseLineProtectedIds(caseData, relation);
      const intruders = [];
      for (const [personId, pos] of positions.entries()) {
        if (protectedIds.has(personId)) continue;
        if (Math.abs(pos.x - p1.x) >= 10) continue;
        if (pos.y > topY + CARD.h / 2 && pos.y < bottomY - CARD.h / 2) intruders.push({ personId, pos });
      }
      intruders.sort((a, b) => a.pos.y - b.pos.y);
      for (const intruder of intruders) {
        const ids = collectVisibleSubtreeIds(caseData, intruder.personId, linksByGroup);
        ids.delete(relation.person1Id);
        ids.delete(relation.person2Id);
        const bounds = subtreeBounds(positions, ids);
        if (!bounds) continue;
        const dy = lowerLimit - bounds.top;
        if (dy <= 0) continue;
        shiftPositions(positions, ids, dy);
        changed = true;
      }
    }
    if (!changed) break;
  }
}

function spouseLineProtectedIds(caseData, relation) {
  const protectedIds = new Set([relation.person1Id, relation.person2Id]);
  for (const anchorId of [relation.person1Id, relation.person2Id]) {
    for (const spouseRelation of getSpouseRelations(caseData, anchorId)) {
      protectedIds.add(otherSpouseId(spouseRelation, anchorId));
    }
  }
  return protectedIds;
}

function clampSpouseRelationGaps(caseData, positions) {
  for (const relation of caseData.spouseRelations.slice().sort(compareSpouseForLayout)) {
    const anchorId = spouseLayoutAnchorId(caseData, relation);
    const otherId = otherSpouseId(relation, anchorId);
    const anchor = positions.get(anchorId);
    const other = positions.get(otherId);
    if (!anchor || !other || Math.abs(anchor.x - other.x) >= 10) continue;
    if (Math.abs(anchor.y - other.y) <= SPOUSE_GAP * 2.2) continue;
    const generation = Math.round((anchor.x - generationX(0)) / X_GAP);
    const slotIndex = spouseRelationSlotIndex(caseData, relation, anchorId);
    const direction = spousePlacementOffset(slotIndex, generation) >= 0 ? 1 : -1;
    other.y = chooseOpenSpouseY(positions, anchor, otherId, direction, SPOUSE_GAP, ROW_GAP);
  }
}

function normalizeChildlessSpouseSlots(caseData, positions) {
  for (const relation of caseData.spouseRelations.slice().sort(compareSpouseForLayout)) {
    if (caseData.parentGroups.some((group) => group.spouseRelationId === relation.spouseRelationId && group.diagramVisibility !== "hidden")) continue;
    const anchorId = spouseLayoutAnchorId(caseData, relation);
    const otherId = otherSpouseId(relation, anchorId);
    const anchor = positions.get(anchorId);
    const other = positions.get(otherId);
    if (!anchor || !other || Math.abs(anchor.x - other.x) >= 10) continue;
    const generation = Math.round((anchor.x - generationX(0)) / X_GAP);
    const slotIndex = spouseRelationSlotIndex(caseData, relation, anchorId);
    const direction = spousePlacementOffset(slotIndex, generation) >= 0 ? 1 : -1;
    other.y = chooseOpenSpouseY(positions, anchor, otherId, direction, SPOUSE_GAP, ROW_GAP);
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
function spouseLayoutAnchorId(caseData, relation) {
  const decedentId = caseData.caseInfo.decedentPersonId;
  if (relation.person1Id === decedentId || relation.person2Id === decedentId) return decedentId;
  const count1 = getSpouseRelations(caseData, relation.person1Id).length;
  const count2 = getSpouseRelations(caseData, relation.person2Id).length;
  return count1 >= count2 ? relation.person1Id : relation.person2Id;
}

function spouseRelationSlotIndex(caseData, relation, anchorId) {
  const relations = getSpouseRelations(caseData, anchorId).slice().sort(compareSpouseForLayout);
  return Math.max(0, relations.findIndex((item) => item.spouseRelationId === relation.spouseRelationId));
}

function spouseSlotDirection(caseData, relation, anchorId) {
  return spouseSlotOffset(spouseRelationSlotIndex(caseData, relation, anchorId)) >= 0 ? 1 : -1;
}

function orderParentPairForStableSpouseSlot(caseData, parents, positions) {
  if (parents.length !== 2) return parents.slice().sort((a, b) => a.pos.y - b.pos.y || String(a.parentId).localeCompare(String(b.parentId)));
  const relation = caseData.spouseRelations.find((item) => (item.person1Id === parents[0].parentId && item.person2Id === parents[1].parentId) || (item.person1Id === parents[1].parentId && item.person2Id === parents[0].parentId));
  if (!relation) return parents.slice().sort((a, b) => a.pos.y - b.pos.y || String(a.parentId).localeCompare(String(b.parentId)));
  const anchorId = spouseLayoutAnchorId(caseData, relation);
  const otherId = otherSpouseId(relation, anchorId);
  const anchorParent = parents.find((item) => item.parentId === anchorId);
  const otherParent = parents.find((item) => item.parentId === otherId);
  if (!anchorParent || !otherParent) return parents.slice().sort((a, b) => a.pos.y - b.pos.y || String(a.parentId).localeCompare(String(b.parentId)));
  const generation = spouseRelationGeneration(caseData, relation, positions);
  const slotIndex = spouseRelationSlotIndex(caseData, relation, anchorId);
  const offset = spousePlacementOffset(slotIndex, generation);
  return offset < 0 ? [otherParent, anchorParent] : [anchorParent, otherParent];
}

function resolveSpouseParentBranchOverlaps(caseData, positions, linksByGroup) {
  const decedentId = caseData.caseInfo.decedentPersonId;
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const relation of caseData.spouseRelations.slice().sort(compareSpouseForLayout)) {
      const p1 = positions.get(relation.person1Id);
      const p2 = positions.get(relation.person2Id);
      if (!p1 || !p2 || Math.abs(p1.x - p2.x) >= 10) continue;
      const generation = spouseRelationGeneration(caseData, relation, positions);
      if (generation > 0) continue;
      const branch1 = parentSideBranchIds(caseData, relation.person1Id, linksByGroup);
      const branch2 = parentSideBranchIds(caseData, relation.person2Id, linksByGroup);
      if (branch1.size <= 1 || branch2.size <= 1) continue;
      const bounds1 = subtreeBounds(positions, branch1);
      const bounds2 = subtreeBounds(positions, branch2);
      if (!bounds1 || !bounds2 || !rangesOverlap(bounds1.top - 18, bounds1.bottom + 18, bounds2.top - 18, bounds2.bottom + 18)) continue;
      const moveSecond = relation.person1Id === decedentId || (relation.person2Id !== decedentId && bounds2.top >= bounds1.top);
      const movingIds = moveSecond ? branch2 : branch1;
      const fixedBounds = moveSecond ? bounds1 : bounds2;
      const movingBounds = moveSecond ? bounds2 : bounds1;
      const dy = fixedBounds.bottom + spouseParentBranchGap(generation) - movingBounds.top;
      if (dy <= 0) continue;
      shiftPositions(positions, movingIds, dy);
      changed = true;
    }
    if (!changed) break;
  }
}

function spouseRelationGeneration(caseData, relation, positions) {
  const p1 = positions.get(relation.person1Id);
  const p2 = positions.get(relation.person2Id);
  const x = p1?.x ?? p2?.x ?? generationX(0);
  return Math.round((x - generationX(0)) / X_GAP);
}

function spouseParentBranchGap(generation) {
  return generation < 0 ? Math.max(22, CARD.h * 0.35) : Math.max(28, CARD.h * 0.45);
}

function parentSideBranchIds(caseData, childId, linksByGroup) {
  const ids = new Set([childId]);
  for (const group of caseData.parentGroups) {
    if (group.childId !== childId || group.diagramVisibility === "hidden") continue;
    const links = linksByGroup.get(group.parentGroupId) || [];
    for (const link of links) collectAncestorBranchIds(caseData, link.parentId, linksByGroup, ids);
  }
  return ids;
}

function compactParentChildDistances(caseData, positions, linksByGroup, peopleById) {
  for (const cluster of buildParentClusters(caseData, linksByGroup)) {
    const parents = cluster.parentIds.map((id) => positions.get(id)).filter(Boolean);
    if (parents.length === 0) continue;
    const centerY = average(parents.map((pos) => pos.y));
    const children = cluster.groups
      .filter((group) => group.diagramVisibility !== "hidden" && positions.has(group.childId))
      .sort((a, b) => compareChildGroups(a, b, peopleById));
    if (children.length === 0) continue;
    for (let index = 0; index < children.length; index += 1) {
      const group = children[index];
      const child = positions.get(group.childId);
      if (!child) continue;
      const desiredY = index === 0 ? centerY : centerY + index * ROW_GAP;
      if (Math.abs(child.y - desiredY) <= ROW_GAP * 2.2) continue;
      const ids = collectVisibleSubtreeIds(caseData, group.childId, linksByGroup);
      for (const parentId of cluster.parentIds) ids.delete(parentId);
      shiftPositions(positions, ids, desiredY - child.y);
    }
  }
}

function alignDirectFirstChildConnections(caseData, positions, linksByGroup, peopleById) {
  for (const cluster of buildParentClusters(caseData, linksByGroup)) {
    const parents = cluster.parentIds.map((parentId) => ({ parentId, pos: positions.get(parentId) })).filter((item) => item.pos);
    if (parents.length === 0) continue;
    const visibleGroups = cluster.groups
      .filter((group) => group.diagramVisibility !== "hidden" && positions.has(group.childId))
      .sort((a, b) => compareChildGroups(a, b, peopleById));
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
    const targetY = parentGroupCenterY(caseData, positions, peopleById, directGroup) ?? childPos.y;
    const orderedParents = orderParentPairForStableSpouseSlot(caseData, parents, positions);
    const currentGap = orderedParents[1].pos.y - orderedParents[0].pos.y;
    if (currentGap > SPOUSE_GAP + 1) {
      movePersonWithChildlessSpouses(caseData, positions, directGroup.childId, (orderedParents[0].pos.y + orderedParents[1].pos.y) / 2 - childPos.y);
      continue;
    }
    orderedParents[0].pos.y = targetY - SPOUSE_GAP / 2;
    orderedParents[1].pos.y = targetY + SPOUSE_GAP / 2;
  }
}

function alignSingleAdoptiveChildrenNearParent(caseData, positions, linksByGroup, minDistance) {
  for (const group of caseData.parentGroups) {
    if (group.diagramVisibility === "hidden" || group.groupKind !== "adoptive") continue;
    const links = linksByGroup.get(group.parentGroupId) || [];
    if (links.length !== 1) continue;
    const parent = positions.get(links[0].parentId);
    const child = positions.get(group.childId);
    if (!parent || !child) continue;
    const targetY = chooseOpenYInColumn(positions, group.childId, child.x, parent.y, minDistance);
    const dy = targetY - child.y;
    if (Math.abs(dy) < 1) continue;
    const ids = collectVisibleSubtreeIds(caseData, group.childId, linksByGroup);
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

function movePersonWithChildlessSpouses(caseData, positions, personId, dy) {
  if (Math.abs(dy) < 1) return;
  const pos = positions.get(personId);
  if (pos) pos.y += dy;
  for (const relation of getSpouseRelations(caseData, personId)) {
    if (caseData.parentGroups.some((group) => group.spouseRelationId === relation.spouseRelationId && group.diagramVisibility !== "hidden")) continue;
    const other = positions.get(otherSpouseId(relation, personId));
    if (other && pos && Math.abs(other.x - pos.x) < 10) other.y += dy;
  }
}

function resolveAllCardOverlaps(caseData, positions, linksByGroup) {
  for (let pass = 0; pass < 12; pass += 1) {
    let changed = false;
    const entries = Array.from(positions.entries()).map(([personId, pos]) => ({ personId, pos }));
    entries.sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x);
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const a = entries[i];
        const b = entries[j];
        if (!cardRectsOverlap(a.pos, b.pos, CARD, 20, 20)) continue;
        const upper = a.pos.y <= b.pos.y ? a : b;
        const lower = a.pos.y <= b.pos.y ? b : a;
        const ids = collectSiblingBlockIds(caseData, lower.personId, positions);
        const bounds = subtreeBounds(positions, ids);
        if (!bounds) continue;
        const minTop = upper.pos.y + CARD.h / 2 + 28;
        const dy = Math.min(ROW_GAP * 1.6, minTop - bounds.top);
        if (dy <= 0) continue;
        shiftPositions(positions, ids, dy);
        changed = true;
      }
    }
    if (!changed) break;
  }
}

function resolveFinalCardRectOverlaps(caseData, positions, linksByGroup) {
  for (let pass = 0; pass < 160; pass += 1) {
    const pair = findOverlappingCardPair(positions, CARD, 18, 18);
    if (!pair) return true;
    const lower = chooseLowerOverlapEntry(caseData, pair);
    const upper = lower === pair.a ? pair.b : pair.a;
    let ids = collectSiblingBlockIds(caseData, lower.personId, positions);
    if (ids.has(upper.personId)) ids = new Set([lower.personId]);
    const bounds = subtreeBounds(positions, ids);
    if (!bounds) continue;
    const minTop = upper.rect.bottom + 28;
    const dy = Math.max(ROW_GAP * 0.5, minTop - bounds.top);
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

function chooseLowerOverlapEntry(caseData, pair) {
  if (Math.abs(pair.a.pos.y - pair.b.pos.y) > 1) return pair.a.pos.y > pair.b.pos.y ? pair.a : pair.b;
  const decedentId = caseData.caseInfo.decedentPersonId;
  if (pair.a.personId === decedentId) return pair.b;
  if (pair.b.personId === decedentId) return pair.a;
  return pair.a.pos.x >= pair.b.pos.x ? pair.a : pair.b;
}

function overlapShiftIds(caseData, linksByGroup, upperId, lowerId) {
  const relatedLowerChild = spouseChildForOverlappingParents(caseData, upperId, lowerId);
  if (relatedLowerChild) return collectLineageBranchIds(caseData, relatedLowerChild, lowerId, linksByGroup);
  return collectVisibleSubtreeIds(caseData, lowerId, linksByGroup);
}

function collectLineageBranchIds(caseData, childId, parentId, linksByGroup, ids = new Set()) {
  if (ids.has(childId)) return ids;
  ids.add(childId);
  const parentGroups = caseData.parentGroups.filter((group) => group.childId === childId && group.diagramVisibility !== "hidden");
  for (const group of parentGroups) {
    const links = linksByGroup.get(group.parentGroupId) || [];
    if (!links.some((link) => link.parentId === parentId)) continue;
    for (const link of links) collectAncestorBranchIds(caseData, link.parentId, linksByGroup, ids);
  }
  for (const group of caseData.parentGroups) {
    if (group.diagramVisibility === "hidden") continue;
    const links = linksByGroup.get(group.parentGroupId) || [];
    if (links.some((link) => link.parentId === childId)) collectLineageBranchIds(caseData, group.childId, childId, linksByGroup, ids);
  }
  return ids;
}

function collectAncestorBranchIds(caseData, personId, linksByGroup, ids) {
  if (ids.has(personId)) return;
  ids.add(personId);
  for (const relation of getSpouseRelations(caseData, personId)) ids.add(otherSpouseId(relation, personId));
  for (const group of caseData.parentGroups) {
    if (group.childId !== personId || group.diagramVisibility === "hidden") continue;
    const links = linksByGroup.get(group.parentGroupId) || [];
    for (const link of links) collectAncestorBranchIds(caseData, link.parentId, linksByGroup, ids);
  }
}

function spouseChildForOverlappingParents(caseData, upperParentId, lowerParentId) {
  const upperChildren = childIdsForParent(caseData, upperParentId);
  const lowerChildren = childIdsForParent(caseData, lowerParentId);
  for (const upperChild of upperChildren) {
    for (const lowerChild of lowerChildren) {
      if (upperChild !== lowerChild && hasSpouseRelation(caseData, upperChild, lowerChild)) return lowerChild;
    }
  }
  return null;
}

function childIdsForParent(caseData, parentId) {
  const ids = [];
  for (const group of caseData.parentGroups) {
    if (group.diagramVisibility === "hidden") continue;
    if (caseData.parentLinks.some((link) => link.parentGroupId === group.parentGroupId && link.parentId === parentId)) ids.push(group.childId);
  }
  return ids;
}

function cardRectsOverlap(a, b, card, gapX, gapY) {
  return Math.abs(a.x - b.x) < card.w + gapX && Math.abs(a.y - b.y) < card.h + gapY;
}
function usedYRangesForGeneration(positions, generations, generation) {
  const ranges = [];
  for (const [personId, pos] of positions.entries()) {
    const personGeneration = generations.get(personId) ?? Math.round((pos.x - 700) / X_GAP);
    if (personGeneration === generation) ranges.push(centeredRange(pos.y, ROW_GAP));
  }
  return ranges;
}

function spouseProtectedYRanges(caseData, positions, generations, generation) {
  const ranges = [];
  for (const relation of caseData.spouseRelations) {
    const p1 = positions.get(relation.person1Id);
    const p2 = positions.get(relation.person2Id);
    if (!p1 || !p2 || Math.abs(p1.x - p2.x) >= 10) continue;
    const g1 = generations.get(relation.person1Id) ?? Math.round((p1.x - 700) / X_GAP);
    const g2 = generations.get(relation.person2Id) ?? Math.round((p2.x - 700) / X_GAP);
    if (g1 !== generation || g2 !== generation) continue;
    ranges.push({ y1: Math.min(p1.y, p2.y) - ROW_GAP / 2, y2: Math.max(p1.y, p2.y) + ROW_GAP / 2, protected: true });
  }
  return ranges;
}

function chooseOpenChildY(preferredY, span, usedRanges, protectedRanges) {
  const height = Math.max(ROW_GAP, span);
  const step = Math.max(CHILD_GAP, Math.ceil(height / 2));
  const candidates = [preferredY];
  const blockingProtected = protectedRanges.find((range) => rangesOverlap(preferredY - height / 2, preferredY + height / 2, range.y1, range.y2));
  if (blockingProtected) {
    candidates.push(blockingProtected.y1 - height / 2 - 28, blockingProtected.y2 + height / 2 + 28);
  }
  for (let i = 1; i <= 18; i += 1) {
    candidates.push(preferredY + i * step, preferredY - i * step);
  }
  const allRanges = usedRanges.concat(protectedRanges);
  const open = candidates.find((candidate) => !allRanges.some((range) => rangesOverlap(candidate - height / 2, candidate + height / 2, range.y1, range.y2)));
  if (open !== undefined) return open;
  const below = Math.max(preferredY, ...allRanges.map((range) => range.y2)) + height / 2 + 28;
  return below;
}

function centeredRange(y, height) {
  return { y1: y - height / 2, y2: y + height / 2 };
}
function estimateSubtreeSpan(caseData, personId, linksByGroup, seen = new Set()) {
  if (seen.has(personId)) return ROW_GAP;
  seen.add(personId);
  let span = ROW_GAP;
  if (getSpouseRelations(caseData, personId).length > 0) span += SPOUSE_GAP;
  const childGroups = [];
  for (const group of caseData.parentGroups) {
    if (group.diagramVisibility === "hidden") continue;
    const links = linksByGroup.get(group.parentGroupId) || [];
    if (links.some((link) => link.parentId === personId)) childGroups.push(group);
  }
  if (childGroups.length > 0) {
    let childrenSpan = 0;
    for (const group of childGroups) {
      childrenSpan += estimateSubtreeSpan(caseData, group.childId, linksByGroup, seen) + 28;
    }
    span += Math.max(0, childrenSpan - 28);
  }
  return Math.max(ROW_GAP, span);
}

function placeParentsForKnownChildren(caseData, positions, linksByGroup, generations) {
  for (const group of caseData.parentGroups) {
    if (group.diagramVisibility === "hidden") continue;
    const childPos = positions.get(group.childId);
    const links = linksByGroup.get(group.parentGroupId) || [];
    if (!childPos || links.length === 0) continue;
    const knownParents = links.map((link) => ({ id: link.parentId, pos: positions.get(link.parentId) })).filter((item) => item.pos);
    const parentGeneration = (generations.get(group.childId) ?? 1) - 1;
    const x = generationX(parentGeneration);
    const unplacedLinks = links.filter((link) => !positions.has(link.parentId));
    for (const link of unplacedLinks) {
      let y = childPos.y;
      if (knownParents.length > 0) {
        const anchor = knownParents[0].pos;
        const usedBelow = knownParents.some((item) => item.pos.y > anchor.y);
        y = anchor.y + (usedBelow ? -SPOUSE_GAP : SPOUSE_GAP);
      } else if (links.length > 1) {
        const index = Math.max(0, links.findIndex((item) => item.parentId === link.parentId));
        y = childPos.y + centeredOffset(index, links.length, SPOUSE_GAP);
      }
      positions.set(link.parentId, { x, y });
    }
  }
}

function resolveColumnOverlaps(caseData, positions, generations) {
  const byColumn = new Map();
  for (const [personId, pos] of positions.entries()) {
    const generation = generations.get(personId) ?? Math.round((pos.x - 700) / X_GAP);
    if (!byColumn.has(generation)) byColumn.set(generation, []);
    byColumn.get(generation).push({ personId, pos });
  }
  for (const [generation, items] of byColumn.entries()) {
    const protectedRanges = spouseProtectedYRanges(caseData, positions, generations, generation);
    items.sort((a, b) => a.pos.y - b.pos.y);
    for (let i = 1; i < items.length; i += 1) {
      const minY = items[i - 1].pos.y + ROW_GAP;
      if (items[i].pos.y < minY) items[i].pos.y = minY;
      items[i].pos.y = avoidProtectedCardY(items[i].pos.y, protectedRanges);
    }
  }
}

function avoidProtectedCardY(y, protectedRanges) {
  let nextY = y;
  for (const range of protectedRanges) {
    if (rangesOverlap(nextY - ROW_GAP / 2, nextY + ROW_GAP / 2, range.y1, range.y2)) {
      const upY = range.y1 - ROW_GAP / 2;
      const downY = range.y2 + ROW_GAP / 2;
      nextY = Math.abs(nextY - upY) <= Math.abs(downY - nextY) ? upY : downY;
    }
  }
  return nextY;
}
function resolveRootSubtreeOverlaps(caseData, positions, linksByGroup, generations) {
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    const rootsByGeneration = new Map();
    for (const person of caseData.people) {
      if (!positions.has(person.personId) || !hasChildGroup(caseData, person.personId)) continue;
      const generation = generations.get(person.personId) ?? Math.round((positions.get(person.personId).x - 700) / X_GAP);
      if (!rootsByGeneration.has(generation)) rootsByGeneration.set(generation, []);
      rootsByGeneration.get(generation).push(person.personId);
    }
    for (const roots of rootsByGeneration.values()) {
      const subtrees = uniqueRootSubtrees(caseData, positions, linksByGroup, roots);
      subtrees.sort((a, b) => a.bounds.top - b.bounds.top);
      let previousBottom = -Infinity;
      for (const subtree of subtrees) {
        const { ids, bounds } = subtree;
        const minTop = previousBottom + ROW_GAP;
        if (bounds.top < minTop) {
          const dy = minTop - bounds.top;
          shiftPositions(positions, ids, dy);
          bounds.bottom += dy;
          changed = true;
        }
        previousBottom = Math.max(previousBottom, bounds.bottom);
      }
    }
    if (!changed) break;
  }
}

function uniqueRootSubtrees(caseData, positions, linksByGroup, roots) {
  const bySignature = new Map();
  for (const rootId of roots) {
    const ids = collectVisibleSubtreeIds(caseData, rootId, linksByGroup);
    const signature = Array.from(ids).sort().join("|");
    if (bySignature.has(signature)) continue;
    const bounds = subtreeBounds(positions, ids);
    if (bounds) bySignature.set(signature, { ids, bounds });
  }
  return Array.from(bySignature.values());
}
function hasChildGroup(caseData, personId) {
  return caseData.parentLinks.some((link) => link.parentId === personId);
}

function collectVisibleSubtreeIds(caseData, rootId, linksByGroup, ids = new Set()) {
  if (ids.has(rootId)) return ids;
  ids.add(rootId);
  for (const relation of getSpouseRelations(caseData, rootId)) ids.add(otherSpouseId(relation, rootId));
  for (const group of caseData.parentGroups) {
    if (group.diagramVisibility === "hidden") continue;
    const links = linksByGroup.get(group.parentGroupId) || [];
    if (links.some((link) => link.parentId === rootId)) collectVisibleSubtreeIds(caseData, group.childId, linksByGroup, ids);
  }
  return ids;
}

function subtreeBounds(positions, ids) {
  let top = Infinity, bottom = -Infinity;
  for (const id of ids) {
    const pos = positions.get(id);
    if (!pos) continue;
    top = Math.min(top, pos.y - CARD.h / 2);
    bottom = Math.max(bottom, pos.y + CARD.h / 2);
  }
  return top === Infinity ? null : { top, bottom };
}

function shiftPositions(positions, ids, dy) {
  for (const id of ids) {
    const pos = positions.get(id);
    if (pos) pos.y += dy;
  }
}
function buildParentClusters(caseData, linksByGroup) {
  const map = new Map();
  for (const group of caseData.parentGroups) {
    if (group.diagramVisibility === "hidden") continue;
    const parentIds = (linksByGroup.get(group.parentGroupId) || []).map((link) => link.parentId).sort();
    const inferredSpouseRelationId = parentIds.length === 2 ? findSpouseRelationId(caseData, parentIds[0], parentIds[1]) : null;
    const key = group.spouseRelationId || inferredSpouseRelationId || parentIds.join("+") || group.parentGroupId;
    if (!map.has(key)) map.set(key, { key, parentIds, groups: [] });
    map.get(key).groups.push(group);
  }
  return Array.from(map.values());
}

function findSpouseRelationId(caseData, personA, personB) {
  const relation = caseData.spouseRelations.find((item) => (item.person1Id === personA && item.person2Id === personB) || (item.person1Id === personB && item.person2Id === personA));
  return relation?.spouseRelationId || null;
}
function placeRemainingPeople(caseData, positions) {
  let index = 0;
  for (const person of caseData.people) {
    if (positions.has(person.personId)) continue;
    positions.set(person.personId, { x: 120 + (index % 4) * 230, y: 720 + Math.floor(index / 4) * 120 });
    index += 1;
  }
}

function normalizePositions(positions) {
  let minX = Infinity, minY = Infinity;
  for (const pos of positions.values()) { minX = Math.min(minX, pos.x - CARD.w / 2); minY = Math.min(minY, pos.y - CARD.h / 2); }
  const dx = MARGIN - minX, dy = MARGIN - minY;
  for (const pos of positions.values()) { pos.x += dx; pos.y += dy; }
}

function getBounds(positions) {
  let maxX = 0, maxY = 0;
  for (const pos of positions.values()) { maxX = Math.max(maxX, pos.x + CARD.w / 2); maxY = Math.max(maxY, pos.y + CARD.h / 2); }
  return { maxX, maxY };
}

function renderSvg(caseData, layout) {
  els.svg.replaceChildren();
  els.svg.setAttribute("width", String(layout.width * state.zoom));
  els.svg.setAttribute("height", String(layout.height * state.zoom));
  els.svg.setAttribute("viewBox", `0 0 ${layout.width * state.zoom} ${layout.height * state.zoom}`);
  const root = svgEl("g", { transform: `scale(${state.zoom})` });
  const lineLayer = svgEl("g", { class: "line-layer" });
  const cardLayer = svgEl("g", { class: "card-layer" });
  els.svg.appendChild(root);
  root.appendChild(lineLayer);
  root.appendChild(cardLayer);
  const linksByGroup = groupBy(caseData.parentLinks, "parentGroupId");
  drawSpouseLines(caseData, layout, lineLayer);
  drawParentChildLines(caseData, layout, linksByGroup, lineLayer);
  for (const person of caseData.people) {
    const pos = layout.positions.get(person.personId);
    if (!pos) continue;
    const card = drawCard(caseData, person, pos, layout.card);
    card.addEventListener("click", () => { state.selectedPersonId = person.personId; state.detailMode = "view"; render(false); });
    cardLayer.appendChild(card);
  }
}

function drawSpouseLines(caseData, layout, layer) {
  for (const relation of caseData.spouseRelations) {
    const p1 = layout.positions.get(relation.person1Id), p2 = layout.positions.get(relation.person2Id);
    if (p1 && p2) drawSpouseConnector(layer, p1, p2, layout.card, relation, layout.positions);
  }
}

function drawParentChildLines(caseData, layout, linksByGroup, layer) {
  const plan = planParentChildLines(caseData, layout, linksByGroup);
  const parentSetSegments = plan.parentSetLines.map((line) => parentSetVerticalSegment(line.p1, line.p2, layout.card));
  const verticalSegments = collectSpouseVerticalSegments(caseData, layout).concat(parentSetSegments, plan.verticalSegments);
  for (const line of plan.parentSetLines) drawSingleParentSetLine(layer, line.p1, line.p2, layout.card);
  for (const segment of plan.verticalSegments) {
    layer.appendChild(svgEl("line", { x1: segment.x, y1: segment.y1, x2: segment.x, y2: segment.y2, stroke: "#374151", "stroke-width": 2, "stroke-linecap": "round", "stroke-dasharray": segment.allAdoptive ? "7 5" : null }));
  }
  for (const path of plan.paths) {
    if (path.kind === "label") {
      const label = svgEl("text", { x: path.labelX, y: path.labelY, fill: "#475569", "font-size": 11, "font-weight": 700 });
      label.textContent = path.label;
      layer.appendChild(label);
      continue;
    }
    const d = path.kind === "horizontal" ? horizontalPathWithJumps(path.x1, path.y, path.x2, verticalSegments, path.skipX) : `M ${path.x1} ${path.y1} V ${path.y2}${horizontalContinuationWithJumps(path.x1, path.y2, path.x2, verticalSegments, path.skipX)}`;
    layer.appendChild(svgEl("path", { d, fill: "none", stroke: "#374151", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-dasharray": path.adoptive ? "7 5" : null }));
  }
}

function planParentChildLines(caseData, layout, linksByGroup) {
  const verticalSegments = [];
  const parentSetLines = [];
  const paths = [];
  for (const cluster of buildParentClusters(caseData, linksByGroup)) {
    const visibleGroups = cluster.groups.filter((group) => group.diagramVisibility !== "hidden");
    if (visibleGroups.length === 0) continue;
    const parents = cluster.parentIds.map((parentId) => ({ parentId, pos: layout.positions.get(parentId) })).filter((item) => item.pos);
    if (parents.length === 0) continue;
    const parentAnchor = parents.length === 1
      ? { x: parents[0].pos.x + layout.card.w / 2, y: parents[0].pos.y }
      : { x: average(parents.map((p) => p.pos.x)), y: average(parents.map((p) => p.pos.y)) };
    if (parents.length > 1 && !cluster.key.startsWith("s")) parentSetLines.push({ p1: parents[0].pos, p2: parents[1].pos });
    const children = visibleGroups.map((group) => ({ group, pos: layout.positions.get(group.childId) })).filter((item) => item.pos).sort((a, b) => a.pos.y - b.pos.y);
    if (children.length === 0) continue;
    const mixedKinds = new Set(children.map((child) => child.group.groupKind)).size > 1;
    const childItems = children.map((child) => {
      const sourceY = parentAnchor.y + parentSourceOffset(caseData, layout, linksByGroup, child.group, mixedKinds);
      return { ...child, sourceY, connectionY: childConnectionY(caseData, layout, linksByGroup, child.group, child.pos.y) };
    });
    const directChild = childItems.find((child) => parents.length === 1 && child.group.groupKind === "adoptive") || childItems.find((child) => child.group.groupKind !== "adoptive" && Math.abs(child.pos.y - parentAnchor.y) < 1) || childItems.find((child) => child.group.groupKind !== "adoptive" && Math.abs(child.connectionY - parentAnchor.y) < 1);
    const routedChildren = directChild ? childItems.filter((child) => child !== directChild) : childItems;
    if (directChild) {
      const childLeft = directChild.pos.x - layout.card.w / 2;
      paths.push({ kind: "horizontal", x1: parentAnchor.x, y: directChild.pos.y, x2: childLeft, skipX: null, adoptive: directChild.group.groupKind === "adoptive" });
    }
    if (routedChildren.length > 0) {
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
        const childLeft = child.pos.x - layout.card.w / 2;
        paths.push({ kind: "horizontal", x1: parentAnchor.x, y: child.sourceY, x2: child.trunkX, skipX: child.trunkX, adoptive: child.group.groupKind === "adoptive" });
        if (child.connectionY === child.sourceY) paths.push({ kind: "horizontal", x1: child.trunkX, y: child.connectionY, x2: childLeft, skipX: child.trunkX, adoptive: child.group.groupKind === "adoptive" });
        else paths.push({ kind: "bent", x1: child.trunkX, y1: child.sourceY, y2: child.connectionY, x2: childLeft, adoptive: child.group.groupKind === "adoptive" });
        if (child.group.adoptionKind) paths.push({ kind: "label", label: child.group.adoptionKind === "special" ? "\u7279\u5225\u990a\u5b50" : "\u666e\u901a\u990a\u5b50", labelX: child.trunkX + 8, labelY: child.connectionY - 8 });
      }
    }
  }
  return { verticalSegments, parentSetLines, paths };
}

function parentSetVerticalSegment(p1, p2, card) {
  return { x: average([p1.x, p2.x]), y1: Math.min(p1.y, p2.y) + card.h / 2, y2: Math.max(p1.y, p2.y) - card.h / 2 };
}

function collectSpouseVerticalSegments(caseData, layout) {
  const segments = [];
  for (const relation of caseData.spouseRelations) {
    const p1 = layout.positions.get(relation.person1Id), p2 = layout.positions.get(relation.person2Id);
    if (!p1 || !p2 || Math.abs(p1.x - p2.x) >= 10) continue;
    if (hasCardBetweenSameColumn(layout.positions, p1, p2, layout.card)) continue;
    segments.push({ x: p1.x, y1: Math.min(p1.y, p2.y) + layout.card.h / 2, y2: Math.max(p1.y, p2.y) - layout.card.h / 2 });
  }
  return segments;
}

function childConnectionY(caseData, layout, linksByGroup, group, baseY) {
  const groups = caseData.parentGroups
    .filter((item) => item.childId === group.childId && item.diagramVisibility !== "hidden")
    .sort((a, b) => parentGroupSourceY(caseData, layout, linksByGroup, a) - parentGroupSourceY(caseData, layout, linksByGroup, b) || compareChildConnectionGroup(a, b));
  const index = Math.max(0, groups.findIndex((item) => item.parentGroupId === group.parentGroupId));
  return baseY + centeredOffset(index, groups.length, 14);
}

function parentGroupSourceY(caseData, layout, linksByGroup, group) {
  const links = linksByGroup.get(group.parentGroupId) || [];
  const positions = links.map((link) => layout.positions.get(link.parentId)).filter(Boolean);
  return positions.length ? average(positions.map((pos) => pos.y)) : 0;
}

function parentSourceOffset(caseData, layout, linksByGroup, group, mixedKinds) {
  const sameChildGroups = caseData.parentGroups.filter((item) => item.childId === group.childId && item.diagramVisibility !== "hidden");
  if (sameChildGroups.length <= 1) return 0;
  const ordered = sameChildGroups.slice().sort((a, b) => parentGroupSourceY(caseData, layout, linksByGroup, a) - parentGroupSourceY(caseData, layout, linksByGroup, b) || compareChildConnectionGroup(a, b));
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

function drawSpouseConnector(layer, p1, p2, card, relation = null, positions = null) {
  if (Math.abs(p1.x - p2.x) >= 10) return;
  const adjacent = !hasCardBetweenSameColumn(positions, p1, p2, card);
  if (adjacent) {
    const x = p1.x;
    const top = Math.min(p1.y, p2.y) + card.h / 2;
    const bottom = Math.max(p1.y, p2.y) - card.h / 2;
    drawVerticalSpouseLine(layer, x, top, bottom, relation);
    if (relation?.spouseStatus === "divorced") drawDivorceMark(layer, x - 18, (top + bottom) / 2);
    return;
  }
  const start = spouseSidePoint(p1, p2, card, relation, positions);
  const end = spouseSidePoint(p2, p1, card, relation, positions);
  const busX = Math.min(p1.x, p2.x) - card.w / 2 - 28 - Math.abs(start.offset) * 0.8;
  drawSpousePath(layer, `M ${start.x} ${start.y} H ${busX} V ${end.y} H ${end.x}`, relation);
  if (relation?.spouseStatus === "divorced") drawDivorceMark(layer, busX - 18, (start.y + end.y) / 2);
}

function drawVerticalSpouseLine(layer, x, top, bottom, relation) {
  if (relation?.spouseStatus === "commonLaw") {
    layer.appendChild(svgEl("line", { x1: x, y1: top, x2: x, y2: bottom, stroke: "#111827", "stroke-width": 2 }));
    return;
  }
  layer.appendChild(svgEl("line", { x1: x - 4, y1: top, x2: x - 4, y2: bottom, stroke: "#111827", "stroke-width": 2 }));
  layer.appendChild(svgEl("line", { x1: x + 4, y1: top, x2: x + 4, y2: bottom, stroke: "#111827", "stroke-width": 2 }));
}

function spouseSidePoint(pos, other, card, relation, positions) {
  const offset = spouseRelationOffset(relation, pos, positions);
  return { x: pos.x - card.w / 2, y: pos.y + offset, offset };
}

function spouseRelationOffset(relation, pos, positions) {
  if (!positions || !relation) return 0;
  const sameColumn = [];
  for (const item of positions.values()) {
    if (Math.abs(item.x - pos.x) < 10) sameColumn.push(item);
  }
  sameColumn.sort((a, b) => a.y - b.y);
  const index = sameColumn.indexOf(pos);
  return centeredOffset(Math.max(0, index), sameColumn.length, 12);
}


function hasCardBetweenSameColumn(positions, p1, p2, card) {
  if (!positions) return false;
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);
  for (const pos of positions.values()) {
    if (pos === p1 || pos === p2) continue;
    if (Math.abs(pos.x - p1.x) < 10 && pos.y > minY + card.h / 2 && pos.y < maxY - card.h / 2) return true;
  }
  return false;
}

function drawSpousePath(layer, d, relation) {
  if (relation?.spouseStatus === "commonLaw") {
    layer.appendChild(svgEl("path", { d, fill: "none", stroke: "#111827", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    return;
  }
  drawDoubleSpousePath(layer, d, { background: "#eef2f7", stroke: "#111827" });
}

function drawDoubleSpousePath(layer, d, options = {}) {
  const stroke = options.stroke || "#111827";
  const background = options.background || "#fff";
  layer.appendChild(svgEl("path", { d, fill: "none", stroke, "stroke-width": 10, "stroke-linecap": "butt", "stroke-linejoin": "miter" }));
  layer.appendChild(svgEl("path", { d, fill: "none", stroke: background, "stroke-width": 6, "stroke-linecap": "butt", "stroke-linejoin": "miter" }));
}

function drawDivorceMark(layer, x, y) {
  const mark = svgEl("text", { x, y: y + 6, fill: "#991b1b", "font-size": 24, "font-weight": 800, "text-anchor": "middle" });
  mark.textContent = "\u00d7";
  layer.appendChild(mark);
}

function drawSingleParentSetLine(layer, p1, p2, card) {
  const x = average([p1.x, p2.x]), top = Math.min(p1.y, p2.y) + card.h / 2, bottom = Math.max(p1.y, p2.y) - card.h / 2;
  layer.appendChild(svgEl("line", { x1: x, y1: top, x2: x, y2: bottom, stroke: "#374151", "stroke-width": 2 }));
}

function drawCard(caseData, person, pos, card) {
  const group = svgEl("g", { class: `svg-card${state.selectedPersonId === person.personId ? " selected" : ""}`, transform: `translate(${pos.x - card.w / 2}, ${pos.y - card.h / 2})` });
  group.appendChild(svgEl("rect", { class: "card-body", x: 0, y: 0, width: card.w, height: card.h, rx: 12, fill: cardFill(caseData, person), stroke: person.personId === caseData.caseInfo.decedentPersonId ? "#7c3aed" : "#64748b", "stroke-width": person.personId === caseData.caseInfo.decedentPersonId ? 3 : 1.5 }));
  const symbol = personSymbol(person), name = displayName(person), title = symbol ? `${symbol} ${name}` : name;
  drawCenteredLines(group, title, card.w / 2, 32, 16, 15, 2, card.w - 20, "#111827", 700);
  if (person.relationshipLabel) drawText(group, person.relationshipLabel, card.w / 2, card.h - 12, 11, "#475569", 600, "middle");
  return group;
}

function renderDetail(caseData) {
  const person = caseData.people.find((p) => p.personId === state.selectedPersonId);
  els.detailContent.replaceChildren();
  if (!person) { const div = document.createElement("div"); div.className = "empty-detail"; div.textContent = "人物カードをクリックしてください。"; els.detailContent.appendChild(div); return; }
  if (state.detailMode === "relationMenu") return renderRelationMenu(caseData, person);
  if (state.detailMode === "relationAddMenu") return renderRelationAddMenu(caseData, person);
  if (state.detailMode === "relationEdit") return renderRelationEditForm(caseData, person);
  if (state.detailMode === "relationDelete") return renderRelationDeleteForm(caseData, person);
  if (state.detailMode === "addSpouse") return renderAddSpouseForm(caseData, person);
  if (state.detailMode === "childMenu") return renderChildMenu(caseData, person);
  if (state.detailMode === "addChild") return renderAddChildForm(caseData, person);
  if (state.detailMode === "addAdoptedChild") return renderAddAdoptedChildForm(caseData, person);
  if (state.detailMode === "addParent") return renderAddParentForm(caseData, person);
  if (state.detailMode === "editPerson") return renderEditPersonForm(caseData, person);
  renderPersonDetail(caseData, person);
}

function renderPersonDetail(caseData, person) {
  appendSelectedPersonHeader(caseData, person);
  const relationActionSection = detailSection("操作");
  const relationActionStack = document.createElement("div");
  relationActionStack.className = "button-stack";
  relationActionStack.appendChild(actionButton("関係性を編集", () => setDetailMode("relationMenu"), "primary"));
  relationActionSection.appendChild(relationActionStack);
  els.detailContent.appendChild(relationActionSection);

  const relationSection = detailSection("関係性");
  relationSection.appendChild(detailTable(relationRows(caseData, person.personId)));
  els.detailContent.appendChild(relationSection);

  const personActionSection = detailSection("人物情報の操作");
  const personActionStack = document.createElement("div");
  personActionStack.className = "button-stack";
  personActionStack.appendChild(actionButton("人物情報を修正", () => setDetailMode("editPerson"), "primary"));
  personActionSection.appendChild(personActionStack);
  els.detailContent.appendChild(personActionSection);

  const personSection = detailSection("人物情報");
  personSection.appendChild(detailTable([["人物ID", person.personId], ["氏名", displayName(person)], ["性別", genderLabel(person.gender)], ["生死", lifeStatusLabel(person.lifeStatus)], ["生年月日", formatWarekiDateCode(person.birthDateWarekiCode)], ["死亡年月日", formatWarekiDateCode(person.deathDateWarekiCode)], ["続柄", person.relationshipLabel || ""], ["相続人区分", heirStatusLabel(person.heirStatus)], ["調査状況", researchStatusLabel(person.researchStatus)]]));
  els.detailContent.appendChild(personSection);

  const dangerSection = detailSection("その他操作");
  if (person.personId === caseData.caseInfo.decedentPersonId) {
    dangerSection.appendChild(disabledButton("人物を削除"));
  } else {
    dangerSection.appendChild(actionButton("人物を削除", () => deletePerson(caseData, person)));
  }
  els.detailContent.appendChild(dangerSection);
  appendJsonPreview(caseData);
}

function deletePerson(caseData, person) {
  if (person.personId === caseData.caseInfo.decedentPersonId) {
    alert("被相続人は削除できません。");
    return;
  }
  const preview = previewDeletePerson(caseData, person.personId);
  if (preview.orphanedPeople.length > 0) {
    alert(`この人物を削除すると、被相続人からつながらない人物が発生するため削除できません。\n\n対象: ${preview.orphanedPeople.map(displayName).join("、")}`);
    return;
  }
  if (!confirm(`${displayName(person)} を削除します。関係性もあわせて削除されます。よろしいですか？`)) return;
  pushUndoSnapshot("人物を削除");
  applyDeletePerson(caseData, person.personId);
  touchCase(caseData);
  state.selectedPersonId = caseData.caseInfo.decedentPersonId || caseData.people[0]?.personId || null;
  state.detailMode = "view";
  render(false);
}

function previewDeletePerson(caseData, personId) {
  const draft = cloneCaseData(caseData);
  applyDeletePerson(draft, personId);
  const reachableIds = reachablePersonIds(draft, draft.caseInfo.decedentPersonId);
  return { orphanedPeople: draft.people.filter((person) => !reachableIds.has(person.personId)) };
}

function applyDeletePerson(caseData, personId) {
  const removedSpouseRelationIds = caseData.spouseRelations
    .filter((relation) => relation.person1Id === personId || relation.person2Id === personId)
    .map((relation) => relation.spouseRelationId);
  caseData.spouseRelations = caseData.spouseRelations.filter((relation) => relation.person1Id !== personId && relation.person2Id !== personId);
  const removedParentGroupIds = new Set(caseData.parentGroups
    .filter((group) => group.childId === personId)
    .map((group) => group.parentGroupId));
  for (const link of caseData.parentLinks) {
    if (link.parentId === personId) removedParentGroupIds.add(link.parentGroupId);
  }
  caseData.parentGroups = caseData.parentGroups.filter((group) => !removedParentGroupIds.has(group.parentGroupId));
  caseData.parentLinks = caseData.parentLinks.filter((link) => !removedParentGroupIds.has(link.parentGroupId) && link.parentId !== personId);
  for (const group of caseData.parentGroups) {
    if (removedSpouseRelationIds.includes(group.spouseRelationId)) group.spouseRelationId = null;
  }
  caseData.people = caseData.people.filter((item) => item.personId !== personId);
}

function reachablePersonIds(caseData, startId) {
  const existingIds = new Set(caseData.people.map((person) => person.personId));
  const visited = new Set();
  if (!existingIds.has(startId)) return visited;
  const adjacency = new Map(caseData.people.map((person) => [person.personId, new Set()]));
  const connect = (a, b) => {
    if (!existingIds.has(a) || !existingIds.has(b)) return;
    adjacency.get(a).add(b);
    adjacency.get(b).add(a);
  };
  for (const relation of caseData.spouseRelations) connect(relation.person1Id, relation.person2Id);
  for (const group of caseData.parentGroups) {
    for (const link of caseData.parentLinks.filter((item) => item.parentGroupId === group.parentGroupId)) {
      connect(link.parentId, group.childId);
    }
  }
  const queue = [startId];
  visited.add(startId);
  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of adjacency.get(current) || []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return visited;
}
function renderRelationMenu(caseData, person) {
  appendSelectedPersonHeader(caseData, person);
  const section = detailSection("関係性を編集"), stack = document.createElement("div");
  stack.className = "button-stack";
  stack.appendChild(actionButton("関係性を追加", () => setDetailMode("relationAddMenu"), "primary"));
  stack.appendChild(actionButton("関係性を修正", () => setDetailMode("relationEdit"), "primary"));
  stack.appendChild(actionButton("関係性を削除", () => setDetailMode("relationDelete")));
  stack.appendChild(actionButton("戻る", () => setDetailMode("view")));
  section.appendChild(stack);
  els.detailContent.appendChild(section);
}

function renderRelationAddMenu(caseData, person) {
  appendSelectedPersonHeader(caseData, person);
  const section = detailSection("関係性を追加"), stack = document.createElement("div");
  stack.className = "button-stack";
  stack.appendChild(actionButton("配偶者を追加", () => setDetailMode("addSpouse"), "primary"));
  stack.appendChild(actionButton("子を追加", () => setDetailMode("childMenu"), "primary"));
  stack.appendChild(actionButton("親を追加", () => setDetailMode("addParent"), "primary"));
  stack.appendChild(actionButton("戻る", () => setDetailMode("relationMenu")));
  section.appendChild(stack);
  els.detailContent.appendChild(section);
}

function renderRelationEditForm(caseData, person) {
  appendSelectedPersonHeader(caseData, person);
  const section = detailSection("関係性を修正");
  const relationItems = editableRelationItems(caseData, person.personId);
  if (relationItems.length === 0) {
    section.appendChild(hintBox("修正できる関係性がありません。"));
    els.detailContent.appendChild(section);
    appendFooterButtons(() => setDetailMode("relationMenu"), () => setDetailMode("relationMenu"));
    return;
  }
  const options = relationItems.map((item) => `<option value="${escapeAttr(item.value)}">${escapeHtml(item.label)}</option>`).join("");
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `<div id="relationEditError" class="inline-error" hidden></div><fieldset class="form-fieldset"><legend>対象</legend><label>関係<select id="relationEditTarget">${options}</select></label></fieldset><div id="relationEditFields"></div>`;
  section.appendChild(wrapper);
  els.detailContent.appendChild(section);
  const renderFields = () => renderRelationEditFields(caseData, relationItems.find((item) => item.value === document.getElementById("relationEditTarget").value));
  document.getElementById("relationEditTarget").addEventListener("change", renderFields);
  renderFields();
  appendFooterButtons(() => saveRelationEdit(caseData, person, relationItems), () => setDetailMode("relationMenu"));
}

function renderRelationEditFields(caseData, item) {
  const area = document.getElementById("relationEditFields");
  area.replaceChildren();
  if (!item) return;
  if (item.type === "spouse") {
    const relation = caseData.spouseRelations.find((rel) => rel.spouseRelationId === item.id);
    const fieldset = document.createElement("fieldset");
    fieldset.className = "form-fieldset";
    fieldset.innerHTML = `<legend>配偶者関係</legend><label>状態<select id="editSpouseStatus"><option value="married">married（婚姻中）</option><option value="divorced">divorced（離婚）</option><option value="commonLaw">commonLaw（内縁）</option></select></label>`;
    area.appendChild(fieldset);
    document.getElementById("editSpouseStatus").value = relation?.spouseStatus || "married";
    return;
  }
  const group = caseData.parentGroups.find((parentGroup) => parentGroup.parentGroupId === item.id);
  const peopleById = mapBy(caseData.people, "personId");
  const parentLinks = caseData.parentLinks.filter((link) => link.parentGroupId === item.id);
  const personOptions = caseData.people
    .filter((candidate) => candidate.personId !== group?.childId)
    .map((candidate) => `<option value="${escapeAttr(candidate.personId)}">${escapeHtml(displayName(candidate))}</option>`)
    .join("");
  const coupleOptions = caseData.spouseRelations
    .filter((relation) => relation.person1Id !== group?.childId && relation.person2Id !== group?.childId)
    .map((relation) => `<option value="${escapeAttr(relation.spouseRelationId)}">${escapeHtml(displayName(peopleById.get(relation.person1Id)))}・${escapeHtml(displayName(peopleById.get(relation.person2Id)))}（${spouseStatusLabel(relation.spouseStatus)}）</option>`)
    .join("");
  const fieldset = document.createElement("fieldset");
  fieldset.className = "form-fieldset";
  fieldset.innerHTML = `<legend>親子関係</legend><label>関係<select id="editParentGroupKind"><option value="biological">実親</option><option value="adoptive">養親</option></select></label><label id="editAdoptionKindRow">養子の種類<select id="editAdoptionKind"><option value="">なし</option><option value="ordinary">ordinary（普通養子）</option><option value="special">special（特別養子）</option></select></label><label>親の構成<select id="editParentComposition"><option value="keep">現在の親構成を維持</option><option value="single">単独親として登録しなおす</option><option value="couple">登録済みの夫婦関係から選びなおす</option></select></label><label id="editSingleParentRow" hidden>単独親<select id="editSingleParentId">${personOptions}</select></label><label id="editCoupleParentRow" hidden>夫婦関係<select id="editCoupleSpouseRelationId">${coupleOptions || `<option value="">登録済みの夫婦関係がありません</option>`}</select></label>`;
  area.appendChild(fieldset);
  document.getElementById("editParentGroupKind").value = group?.groupKind || "biological";
  document.getElementById("editAdoptionKind").value = group?.adoptionKind || "";
  if (parentLinks[0]) document.getElementById("editSingleParentId").value = parentLinks[0].parentId;
  if (group?.spouseRelationId) document.getElementById("editCoupleSpouseRelationId").value = group.spouseRelationId;
  const refreshComposition = () => {
    const mode = document.getElementById("editParentComposition").value;
    document.getElementById("editSingleParentRow").hidden = mode !== "single";
    document.getElementById("editCoupleParentRow").hidden = mode !== "couple";
  };
  document.getElementById("editParentComposition").addEventListener("change", refreshComposition);
  refreshComposition();
}

function renderRelationDeleteForm(caseData, person) {
  appendSelectedPersonHeader(caseData, person);
  const section = detailSection("関係性を削除");
  const relationItems = editableRelationItems(caseData, person.personId);
  if (relationItems.length === 0) {
    section.appendChild(hintBox("削除できる関係性がありません。"));
    els.detailContent.appendChild(section);
    appendFooterButtons(() => setDetailMode("relationMenu"), () => setDetailMode("relationMenu"));
    return;
  }
  const options = relationItems.map((item) => `<option value="${escapeAttr(item.value)}">${escapeHtml(item.label)}</option>`).join("");
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `<div id="relationDeleteError" class="inline-error" hidden></div><div class="warning-box">関係性だけを削除します。人物カードは削除しません。</div><fieldset class="form-fieldset"><legend>対象</legend><label>関係<select id="relationDeleteTarget">${options}</select></label></fieldset>`;
  section.appendChild(wrapper);
  els.detailContent.appendChild(section);
  appendFooterButtons(() => deleteRelation(caseData, person, relationItems), () => setDetailMode("relationMenu"));
}

function renderChildMenu(caseData, person) {
  appendSelectedPersonHeader(caseData, person);
  const section = detailSection("子を追加"), stack = document.createElement("div");
  stack.className = "button-stack";
  stack.appendChild(actionButton("実子を追加", () => setDetailMode("addChild"), "primary"));
  stack.appendChild(actionButton("養子を追加", () => setDetailMode("addAdoptedChild"), "primary"));
  stack.appendChild(actionButton("戻る", () => setDetailMode("relationAddMenu")));
  section.appendChild(stack);
  els.detailContent.appendChild(section);
}

function renderEditPersonForm(caseData, person) {
  appendSelectedPersonHeader(caseData, person);
  const section = detailSection("人物情報を修正");
  const isDecedent = person.personId === caseData.caseInfo.decedentPersonId;
  section.appendChild(personFormFields("edit", isDecedent ? "被相続人情報" : "人物情報"));
  els.detailContent.appendChild(section);
  document.getElementById("editFamilyName").value = person.familyName || "";
  document.getElementById("editGivenName").value = person.givenName || "";
  document.getElementById("editGender").value = person.gender || "unset";
  document.getElementById("editLifeStatus").value = isDecedent ? "deceased" : person.lifeStatus || "unset";
  document.getElementById("editBirthDate").value = person.birthDateWarekiCode || "";
  document.getElementById("editDeathDate").value = person.deathDateWarekiCode || "";
  refreshWarekiDateInputs("edit");
  document.getElementById("editRelationship").value = isDecedent ? "被相続人" : person.relationshipLabel || "";
  document.getElementById("editHeirStatus").value = isDecedent ? "unset" : person.heirStatus || "unset";
  document.getElementById("editResearchStatus").value = isDecedent ? "checking" : person.researchStatus || "unset";
  if (isDecedent) {
    document.getElementById("editLifeStatus").disabled = true;
    document.getElementById("editRelationship").disabled = true;
    document.getElementById("editHeirStatus").disabled = true;
    document.getElementById("editResearchStatus").disabled = true;
  }
  appendFooterButtons(() => savePersonEdit(caseData, person), () => setDetailMode("view"));
}

function renderAddSpouseForm(caseData, person) {
  appendSelectedPersonHeader(caseData, person);
  const section = detailSection("配偶者を追加");
  section.appendChild(hintBox("人物カードの追加は、必ず配偶者関係の作成とセットで行います。"));
  const existingPeople = caseData.people.filter((p) => p.personId !== person.personId && !hasSpouseRelation(caseData, person.personId, p.personId));
  const existingOptions = existingPeople.map((p) => `<option value="${escapeAttr(p.personId)}">${escapeHtml(displayName(p))}（${escapeHtml(p.personId)}）</option>`).join("") || "<option value=\"\">選択できる既存人物がありません</option>";
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `<div id="spouseError" class="inline-error" hidden></div><fieldset class="form-fieldset"><legend>相手を選ぶ</legend><label><select id="spouseTargetType"><option value="new">新しい人物を作る</option><option value="existing">既存人物から選ぶ</option></select></label><div id="existingSpouseArea" class="form-row" hidden><label>既存人物<select id="existingSpouseId">${existingOptions}</select></label></div></fieldset><div id="newSpouseArea"></div>`;
  section.appendChild(wrapper);
  wrapper.querySelector("#newSpouseArea").appendChild(personFormFields("spouse", "新しい人物情報"));
  const rel = document.createElement("fieldset");
  rel.className = "form-fieldset";
  rel.innerHTML = `<legend>配偶者関係</legend><label>spouseStatus<select id="spouseStatusInput"><option value="married">married（婚姻中）</option><option value="divorced">divorced（離婚）</option><option value="commonLaw">commonLaw（内縁）</option></select></label>`;
  section.appendChild(rel);
  els.detailContent.appendChild(section);
  document.getElementById("spouseFamilyName").value = person.familyName || "";
  document.getElementById("spouseGender").value = oppositeGender(person.gender);
  document.getElementById("spouseTargetType").addEventListener("change", (event) => {
    document.getElementById("existingSpouseArea").hidden = event.target.value !== "existing";
    document.getElementById("newSpouseArea").hidden = event.target.value !== "new";
  });
  appendFooterButtons(() => saveSpouse(caseData, person), () => setDetailMode("relationAddMenu"));
}

function renderAddChildForm(caseData, person) {
  appendSelectedPersonHeader(caseData, person);
  const spouses = getSpouseRelations(caseData, person.personId);
  const section = detailSection("実子を追加");
  const peopleById = mapBy(caseData.people, "personId");
  const spouseOptions = spouses.map((relation) => {
    const other = peopleById.get(otherSpouseId(relation, person.personId));
    return `<option value="${escapeAttr(relation.spouseRelationId)}">${escapeHtml(displayName(other))}（${escapeHtml(spouseStatusLabel(relation.spouseStatus))}）</option>`;
  }).join("") + `<option value="unknown">親(不明)として追加</option>`;
  const wrapper = document.createElement("div");
  wrapper.appendChild(hintBox("選択中人物と、その配偶者を親として、子の人物カードと実子関係をまとめて作成します。"));
  wrapper.innerHTML += `<div id="childError" class="inline-error" hidden></div><fieldset class="form-fieldset"><legend>もう一人の親</legend><label>選択中人物の配偶者<select id="childSpouseRelationId">${spouseOptions}</select></label></fieldset>`;
  section.appendChild(wrapper);
  section.appendChild(personFormFields("child", "子の人物情報"));
  els.detailContent.appendChild(section);
  const selectedRelation = caseData.spouseRelations.find((relation) => relation.spouseRelationId === document.getElementById("childSpouseRelationId").value);
  applyChildFamilyNameDefault(caseData, person, selectedRelation);
  document.getElementById("childSpouseRelationId").addEventListener("change", (event) => {
    applyChildFamilyNameDefault(caseData, person, caseData.spouseRelations.find((relation) => relation.spouseRelationId === event.target.value));
  });
  appendFooterButtons(() => saveChild(caseData, person), () => setDetailMode("childMenu"));
}

function renderAddAdoptedChildForm(caseData, person) {
  appendSelectedPersonHeader(caseData, person);
  const spouses = getSpouseRelations(caseData, person.personId);
  const peopleById = mapBy(caseData.people, "personId");
  const spouseOptions = `<option value="single">単独養親として登録</option>` + spouses.map((relation) => {
    const other = peopleById.get(otherSpouseId(relation, person.personId));
    return `<option value="${escapeAttr(relation.spouseRelationId)}">${escapeHtml(displayName(other))}（${escapeHtml(spouseStatusLabel(relation.spouseStatus))}）</option>`;
  }).join("");
  const section = detailSection("養子を追加");
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `<div id="adoptedError" class="inline-error" hidden></div><fieldset class="form-fieldset"><legend>養子関係</legend><label>養子の種類<select id="adoptionKindInput"><option value="ordinary">ordinary（普通養子）</option><option value="special">special（特別養子）</option></select></label><label>もう一人の養親<select id="adoptiveSpouseRelationId">${spouseOptions}</select></label></fieldset>`;
  section.appendChild(wrapper);
  section.appendChild(personFormFields("adopted", "養子の人物情報"));
  els.detailContent.appendChild(section);
  appendFooterButtons(() => saveAdoptedChild(caseData, person), () => setDetailMode("childMenu"));
}

function renderAddParentForm(caseData, person) {
  appendSelectedPersonHeader(caseData, person);
  const section = detailSection("親を追加");
  section.appendChild(hintBox("選択中人物の親世代を左側に追加します。既存の夫婦関係へ関係線だけを追加することもできます。"));
  const peopleById = mapBy(caseData.people, "personId");
  const coupleOptions = caseData.spouseRelations.map((relation) => {
    const p1 = peopleById.get(relation.person1Id);
    const p2 = peopleById.get(relation.person2Id);
    return `<option value="${escapeAttr(relation.spouseRelationId)}">${escapeHtml(displayName(p1))}・${escapeHtml(displayName(p2))}（${escapeHtml(spouseStatusLabel(relation.spouseStatus))}）</option>`;
  }).join("");
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `<div id="parentError" class="inline-error" hidden></div><fieldset class="form-fieldset"><legend>登録方式</legend><label>方式<select id="parentAddMode"><option value="new">新しく人物を登録</option><option value="linkOnly">関係線のみ追加</option></select></label></fieldset><fieldset class="form-fieldset"><legend>親の種類</legend><label>関係<select id="parentGroupKindInput"><option value="biological">実親として追加</option><option value="adoptive">養親として追加</option></select></label><label id="parentAdoptionKindRow" hidden>養子の種類<select id="parentAdoptionKindInput"><option value="ordinary">ordinary（普通養子）</option><option value="special">special（特別養子）</option></select></label><label id="secondParentTypeRow">もう一人の親<select id="secondParentType"><option value="unknown">親(不明)として追加</option><option value="new">新しい人物を作る</option><option value="none">追加しない</option></select></label><label id="existingParentCoupleRow" hidden>登録済みの夫婦関係<select id="existingParentSpouseRelationId">${coupleOptions || `<option value="">登録済みの夫婦関係がありません</option>`}</select></label></fieldset>`;
  section.appendChild(wrapper);
  const parent1Area = document.createElement("div");
  parent1Area.id = "parent1Area";
  parent1Area.appendChild(personFormFields("parent1", "親1の人物情報"));
  section.appendChild(parent1Area);
  const secondArea = document.createElement("div");
  secondArea.id = "secondParentArea";
  secondArea.appendChild(personFormFields("parent2", "もう一人の親の人物情報"));
  section.appendChild(secondArea);
  els.detailContent.appendChild(section);
  const applyParentFamilyNameDefault = () => {
    const shouldPrefill = !(document.getElementById("parentGroupKindInput").value === "biological" && hasAdoptiveParentGroup(caseData, person.personId));
    const value = shouldPrefill ? person.familyName || "" : "";
    document.getElementById("parent1FamilyName").value = value;
    document.getElementById("parent2FamilyName").value = value;
  };
  applyParentFamilyNameDefault();
  const syncParentForm = () => {
    const mode = document.getElementById("parentAddMode").value;
    document.getElementById("parent1Area").hidden = mode === "linkOnly";
    document.getElementById("secondParentTypeRow").hidden = mode === "linkOnly";
    document.getElementById("existingParentCoupleRow").hidden = mode !== "linkOnly";
    document.getElementById("secondParentArea").hidden = mode === "linkOnly" || document.getElementById("secondParentType").value !== "new";
  };
  document.getElementById("parentGroupKindInput").addEventListener("change", (event) => {
    document.getElementById("parentAdoptionKindRow").hidden = event.target.value !== "adoptive";
    applyParentFamilyNameDefault();
  });
  document.getElementById("parentAddMode").addEventListener("change", syncParentForm);
  document.getElementById("secondParentType").addEventListener("change", syncParentForm);
  syncParentForm();
  appendFooterButtons(() => saveParent(caseData, person), () => setDetailMode("relationAddMenu"));
}

function oppositeGender(gender) {
  if (gender === "male") return "female";
  if (gender === "female") return "male";
  return "unset";
}

function hasAdoptiveParentGroup(caseData, childId) {
  return caseData.parentGroups.some((group) => group.childId === childId && group.groupKind === "adoptive");
}

function applyChildFamilyNameDefault(caseData, person, spouseRelation) {
  const input = document.getElementById("childFamilyName");
  if (!input) return;
  if (!spouseRelation) {
    input.value = person.familyName || "";
    return;
  }
  const other = caseData.people.find((p) => p.personId === otherSpouseId(spouseRelation, person.personId));
  input.value = person.familyName && other?.familyName && person.familyName === other.familyName ? person.familyName : person.familyName || "";
}

function appendFooterButtons(saveAction, cancelAction) {
  if (cancelAction && !els.detailContent.querySelector(".top-cancel-row")) {
    const topRow = document.createElement("div");
    topRow.className = "button-row top-cancel-row";
    topRow.appendChild(actionButton("キャンセル", cancelAction));
    const firstSection = els.detailContent.querySelector(".detail-section");
    if (firstSection) els.detailContent.insertBefore(topRow, firstSection);
    else els.detailContent.appendChild(topRow);
  }
  const row = document.createElement("div");
  row.className = "button-row";
  row.appendChild(actionButton("保存", saveAction, "primary"));
  row.appendChild(actionButton("キャンセル", cancelAction));
  els.detailContent.appendChild(row);
}
function personFormFields(prefix, legend) {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "form-fieldset";
  fieldset.innerHTML = `<legend>${escapeHtml(legend)}</legend><div class="form-row two-col"><label>姓<span class="required">姓または名が必須</span><input id="${prefix}FamilyName" type="text"></label><label>名<input id="${prefix}GivenName" type="text"></label></div><div class="form-row two-col"><label>性別<select id="${prefix}Gender"><option value="unset">未設定</option><option value="male">男性</option><option value="female">女性</option></select></label><label>生死<select id="${prefix}LifeStatus"><option value="unset">未設定</option><option value="alive">生存</option><option value="deceased">死亡</option></select></label></div><div class="form-row two-col"><label>被相続人との続柄<input id="${prefix}Relationship" type="text" placeholder="例: 妻、長男、長女"></label><label>相続人区分<select id="${prefix}HeirStatus"><option value="unset">未設定</option><option value="heir">相続人</option><option value="nonHeir">非相続人</option><option value="renounced">\u76f8\u7d9a\u653e\u68c4</option></select></label></div><div class="form-row two-col"><label>生年月日（和暦7桁）<input id="${prefix}BirthDate" type="text" inputmode="numeric" maxlength="12" placeholder="例: 5080630"></label><label>死亡年月日（和暦7桁）<input id="${prefix}DeathDate" type="text" inputmode="numeric" maxlength="12" placeholder="例: 5050401"></label></div><div class="form-row"><label>調査状況<select id="${prefix}ResearchStatus"><option value="unset">未設定</option><option value="checking">調査中</option><option value="completed">調査完了</option></select></label></div>`;
  bindWarekiDateInput(fieldset.querySelector(`#${prefix}BirthDate`));
  bindWarekiDateInput(fieldset.querySelector(`#${prefix}DeathDate`));
  return fieldset;
}

function editableRelationItems(caseData, personId) {
  const peopleById = mapBy(caseData.people, "personId");
  const items = [];
  const addedSpouseRelationIds = new Set();
  const addSpouseRelationItem = (relation, labelPrefix = "配偶者") => {
    if (!relation || addedSpouseRelationIds.has(relation.spouseRelationId)) return;
    const otherId = relation.person1Id === personId ? relation.person2Id : relation.person1Id;
    const other = peopleById.get(otherId) || peopleById.get(relation.person1Id) || peopleById.get(relation.person2Id);
    items.push({ type: "spouse", id: relation.spouseRelationId, value: `spouse:${relation.spouseRelationId}`, label: `${labelPrefix}: ${displayName(other)}（${spouseStatusLabel(relation.spouseStatus)}）` });
    addedSpouseRelationIds.add(relation.spouseRelationId);
  };
  for (const relation of getSpouseRelations(caseData, personId)) addSpouseRelationItem(relation);
  for (const group of caseData.parentGroups) {
    const links = caseData.parentLinks.filter((link) => link.parentGroupId === group.parentGroupId);
    if (group.childId === personId) {
      const parents = links.map((link) => displayName(peopleById.get(link.parentId))).join("・");
      items.push({ type: "parentGroup", id: group.parentGroupId, value: `parent:${group.parentGroupId}`, label: `親: ${parents}（${groupKindLabel(group)}）` });
      addSpouseRelationItem(caseData.spouseRelations.find((relation) => relation.spouseRelationId === group.spouseRelationId), "親の配偶関係");
    } else if (links.some((link) => link.parentId === personId)) {
      items.push({ type: "parentGroup", id: group.parentGroupId, value: `parent:${group.parentGroupId}`, label: `子: ${displayName(peopleById.get(group.childId))}（${groupKindLabel(group)}）` });
      addSpouseRelationItem(caseData.spouseRelations.find((relation) => relation.spouseRelationId === group.spouseRelationId), "親の配偶関係");
    }
  }
  return items;
}
function saveRelationEdit(caseData, person, relationItems) {
  const error = document.getElementById("relationEditError");
  const item = relationItems.find((entry) => entry.value === document.getElementById("relationEditTarget").value);
  if (!item) return showInlineError(error, "修正する関係性を選択してください。");
  if (item.type === "spouse") {
    const relation = caseData.spouseRelations.find((rel) => rel.spouseRelationId === item.id);
    if (!relation) return showInlineError(error, "配偶者関係が見つかりません。");
    const nextStatus = document.getElementById("editSpouseStatus").value;
    if (isActiveSpouseStatus(nextStatus)) {
      const otherId = otherSpouseId(relation, person.personId);
      const conflict = caseData.spouseRelations.some((rel) => rel.spouseRelationId !== relation.spouseRelationId && isActiveSpouseStatus(rel.spouseStatus) && (rel.person1Id === person.personId || rel.person2Id === person.personId || rel.person1Id === otherId || rel.person2Id === otherId));
      if (conflict) {
        return showInlineError(error, "婚姻中または内縁に変更すると重婚になるため保存できません。");
      }
    }
    pushUndoSnapshot("関係性を修正");
    relation.spouseStatus = nextStatus;
  } else {
    const group = caseData.parentGroups.find((parentGroup) => parentGroup.parentGroupId === item.id);
    if (!group) return showInlineError(error, "親子関係が見つかりません。");
    const compositionMode = document.getElementById("editParentComposition")?.value || "keep";
    if (compositionMode === "single" && !document.getElementById("editSingleParentId")?.value) return showInlineError(error, "単独親を選択してください。");
    if (compositionMode === "couple" && !document.getElementById("editCoupleSpouseRelationId")?.value) return showInlineError(error, "夫婦関係を選択してください。");
    pushUndoSnapshot("関係性を修正");
    group.groupKind = document.getElementById("editParentGroupKind").value;
    group.adoptionKind = group.groupKind === "adoptive" ? document.getElementById("editAdoptionKind").value || "ordinary" : null;
    if (compositionMode === "single") {
      replaceParentLinksForGroup(caseData, group, [document.getElementById("editSingleParentId").value], null);
    } else if (compositionMode === "couple") {
      const relation = caseData.spouseRelations.find((entry) => entry.spouseRelationId === document.getElementById("editCoupleSpouseRelationId").value);
      if (!relation) return showInlineError(error, "夫婦関係が見つかりません。");
      replaceParentLinksForGroup(caseData, group, [relation.person1Id, relation.person2Id], relation.spouseRelationId);
    }
  }
  touchCase(caseData);
  state.selectedPersonId = person.personId;
  state.detailMode = "view";
  render(false);
}

function replaceParentLinksForGroup(caseData, group, parentIds, spouseRelationId) {
  group.spouseRelationId = spouseRelationId;
  caseData.parentLinks = caseData.parentLinks.filter((link) => link.parentGroupId !== group.parentGroupId);
  for (const parentId of parentIds.filter(Boolean)) {
    caseData.parentLinks.push({ parentLinkId: nextId(caseData.parentLinks, "parentLinkId", "pl"), parentGroupId: group.parentGroupId, parentId, isLegalConnectionSevered: false, note: "" });
  }
}

function deleteRelation(caseData, person, relationItems) {
  const error = document.getElementById("relationDeleteError");
  const item = relationItems.find((entry) => entry.value === document.getElementById("relationDeleteTarget").value);
  if (!item) return showInlineError(error, "削除する関係性を選択してください。");
  const draft = cloneCaseData(caseData);
  applyRelationDeletion(draft, item);
  const reachableIds = reachablePersonIds(draft, draft.caseInfo.decedentPersonId);
  const disconnected = draft.people.filter((candidate) => !reachableIds.has(candidate.personId));
  if (disconnected.length > 0) {
    return showInlineError(error, `この関係を削除すると、${disconnected.map(displayName).join("、")} が相続関係図から独立するため削除できません。`);
  }
  const message = item.type === "spouse" ? "この配偶者関係を削除します。人物カードは残ります。" : "この親子関係を削除します。人物カードは残ります。";
  if (!confirm(message)) return;
  pushUndoSnapshot("関係性を削除");
  applyRelationDeletion(caseData, item);
  touchCase(caseData);
  state.selectedPersonId = person.personId;
  state.detailMode = "view";
  render(false);
}

function applyRelationDeletion(caseData, item) {
  if (item.type === "spouse") {
    caseData.spouseRelations = caseData.spouseRelations.filter((relation) => relation.spouseRelationId !== item.id);
    for (const group of caseData.parentGroups) {
      if (group.spouseRelationId === item.id) group.spouseRelationId = null;
    }
    return;
  }
  caseData.parentGroups = caseData.parentGroups.filter((group) => group.parentGroupId !== item.id);
  caseData.parentLinks = caseData.parentLinks.filter((link) => link.parentGroupId !== item.id);
}

function pushUndoSnapshot(label) {
  if (!state.caseData) return;
  state.undoSnapshot = {
    label,
    selectedPersonId: state.selectedPersonId,
    detailMode: state.detailMode,
    caseData: JSON.stringify(state.caseData)
  };
}

function undoLastOperation() {
  if (!state.undoSnapshot) return;
  const snapshot = state.undoSnapshot;
  state.caseData = JSON.parse(snapshot.caseData);
  normalizeCaseData(state.caseData);
  state.selectedPersonId = snapshot.selectedPersonId;
  state.detailMode = "view";
  state.undoSnapshot = null;
  render(false);
}
function cloneCaseData(caseData) {
  return JSON.parse(JSON.stringify(caseData));
}

function saveSpouse(caseData, person) {
  const error = document.getElementById("spouseError");
  const spouseStatus = document.getElementById("spouseStatusInput").value;
  if (isActiveSpouseStatus(spouseStatus) && hasActiveSpouse(caseData, person.personId)) {
    return showInlineError(error, "現在有効な配偶者関係があるため、婚姻中または内縁の配偶者は追加できません。");
  }
  const targetType = document.getElementById("spouseTargetType").value;
  let spousePersonId;
  if (targetType === "existing") {
    spousePersonId = document.getElementById("existingSpouseId").value;
    if (!spousePersonId) return showInlineError(error, "既存人物を選択してください。");
  } else {
    const values = readPersonForm("spouse");
    if (!values.familyName && !values.givenName) return showInlineError(error, "新しい人物の姓または名のどちらかを入力してください。");
    if (!confirmDuplicatePerson(caseData, values)) return;
    spousePersonId = nextId(caseData.people, "personId", "p");
    pushUndoSnapshot("配偶者を追加");
    caseData.people.push(makePerson({ personId: spousePersonId, ...values }));
  }
  if (hasSpouseRelation(caseData, person.personId, spousePersonId)) return showInlineError(error, "この2人の配偶者関係はすでに存在します。");
  if (isActiveSpouseStatus(spouseStatus) && hasActiveSpouse(caseData, spousePersonId)) {
    return showInlineError(error, "相手にも現在有効な配偶者関係があるため、婚姻中または内縁の配偶者は追加できません。");
  }
  if (targetType === "existing") pushUndoSnapshot("配偶者を追加");
  caseData.spouseRelations.push({ spouseRelationId: nextId(caseData.spouseRelations, "spouseRelationId", "s"), person1Id: person.personId, person2Id: spousePersonId, spouseStatus, displayOrder: nextSpouseDisplayOrder(caseData, person.personId), note: "" });
  touchCase(caseData);
  state.selectedPersonId = person.personId;
  state.detailMode = "view";
  render(false);
}

function isActiveSpouseStatus(status) { return status === "married" || status === "commonLaw"; }
function hasActiveSpouse(caseData, personId) {
  return getSpouseRelations(caseData, personId).some((relation) => isActiveSpouseStatus(relation.spouseStatus));
}
function hasSpouseRelation(caseData, personA, personB) {
  return caseData.spouseRelations.some((relation) => (relation.person1Id === personA && relation.person2Id === personB) || (relation.person1Id === personB && relation.person2Id === personA));
}
function confirmDuplicatePerson(caseData, values) {
  const newName = normalizeName(`${values.familyName || ""}${values.givenName || ""}`);
  const candidates = caseData.people.filter((person) => {
    const existingName = normalizeName(displayName(person));
    const givenMatches = values.givenName && person.givenName && values.givenName === person.givenName;
    return newName && existingName && (newName === existingName || givenMatches);
  });
  if (candidates.length === 0) return true;
  const names = candidates.map((person) => `- ${displayName(person)}（${person.personId}）`).join("\n");
  return confirm(`同一人物の可能性がある候補があります。\n\n${names}\n\n別人として新規作成しますか？`);
}
function normalizeName(value) { return String(value || "").replace(/[\s　]/g, ""); }

function saveChild(caseData, person) {
  const error = document.getElementById("childError");
  let spouseRelationId = document.getElementById("childSpouseRelationId").value;
  const spouseRelation = caseData.spouseRelations.find((relation) => relation.spouseRelationId === spouseRelationId);
  const values = readPersonForm("child");
  if (!values.familyName && !values.givenName) return showInlineError(error, "子の姓または名のどちらかを入力してください。");
  if (!confirmDuplicatePerson(caseData, values)) return;
  const useUnknownParent = spouseRelationId === "unknown";
  if (!useUnknownParent && !spouseRelation) return showInlineError(error, "もう一人の親を選択してください。");
  pushUndoSnapshot("子を追加");
  const childId = nextId(caseData.people, "personId", "p");
  const parentGroupId = nextId(caseData.parentGroups, "parentGroupId", "pg");
  const otherParentId = useUnknownParent ? nextId(caseData.people.concat([{ personId: childId }]), "personId", "p") : otherSpouseId(spouseRelation, person.personId);
  caseData.people.push(makePerson({ personId: childId, ...values }));
  if (useUnknownParent) {
    caseData.people.push(makePerson({ personId: otherParentId, familyName: "", givenName: "", gender: "unset", lifeStatus: "unset", relationshipLabel: "親(不明)", heirStatus: "unset", researchStatus: "checking" }));
    caseData.people[caseData.people.length - 1].isUnknownPerson = true;
    spouseRelationId = nextId(caseData.spouseRelations, "spouseRelationId", "s");
    caseData.spouseRelations.push({ spouseRelationId, person1Id: person.personId, person2Id: otherParentId, spouseStatus: "commonLaw", displayOrder: nextSpouseDisplayOrder(caseData, person.personId), note: "実子追加時に作成した親(不明)との関係" });
  }
  caseData.parentGroups.push({ parentGroupId, childId, groupKind: "biological", adoptionKind: null, spouseRelationId, diagramVisibility: "visible", displayOrder: nextChildDisplayOrder(caseData, spouseRelationId), note: "" });
  caseData.parentLinks.push({ parentLinkId: nextId(caseData.parentLinks, "parentLinkId", "pl"), parentGroupId, parentId: person.personId, isLegalConnectionSevered: false, note: "" });
  caseData.parentLinks.push({ parentLinkId: nextId(caseData.parentLinks, "parentLinkId", "pl"), parentGroupId, parentId: otherParentId, isLegalConnectionSevered: false, note: "" });
  touchCase(caseData);
  state.selectedPersonId = person.personId;
  state.detailMode = "view";
  render(false);
}

function saveAdoptedChild(caseData, person) {
  const error = document.getElementById("adoptedError");
  const values = readPersonForm("adopted");
  if (!values.familyName && !values.givenName) return showInlineError(error, "養子の姓または名のどちらかを入力してください。");
  if (!confirmDuplicatePerson(caseData, values)) return;
  pushUndoSnapshot("養子を追加");
  const childId = nextId(caseData.people, "personId", "p");
  const parentGroupId = nextId(caseData.parentGroups, "parentGroupId", "pg");
  const spouseRelationId = document.getElementById("adoptiveSpouseRelationId").value;
  const spouseRelation = caseData.spouseRelations.find((relation) => relation.spouseRelationId === spouseRelationId);
  caseData.people.push(makePerson({ personId: childId, ...values }));
  caseData.parentGroups.push({ parentGroupId, childId, groupKind: "adoptive", adoptionKind: document.getElementById("adoptionKindInput").value, spouseRelationId: spouseRelation ? spouseRelationId : null, diagramVisibility: "visible", displayOrder: nextChildDisplayOrder(caseData, spouseRelationId), note: "" });
  caseData.parentLinks.push({ parentLinkId: nextId(caseData.parentLinks, "parentLinkId", "pl"), parentGroupId, parentId: person.personId, isLegalConnectionSevered: false, note: "" });
  if (spouseRelation) {
    caseData.parentLinks.push({ parentLinkId: nextId(caseData.parentLinks, "parentLinkId", "pl"), parentGroupId, parentId: otherSpouseId(spouseRelation, person.personId), isLegalConnectionSevered: false, note: "" });
  }
  touchCase(caseData);
  state.selectedPersonId = person.personId;
  state.detailMode = "view";
  render(false);
}

function saveParent(caseData, person) {
  const error = document.getElementById("parentError");
  const groupKind = document.getElementById("parentGroupKindInput").value;
  if (groupKind === "biological" && caseData.parentGroups.some((group) => group.childId === person.personId && group.groupKind === "biological")) {
    return showInlineError(error, "この人物にはすでに実親関係があります。追加する場合は養親として登録してください。");
  }
  const mode = document.getElementById("parentAddMode")?.value || "new";
  if (mode === "linkOnly") return saveParentLinkOnly(caseData, person, groupKind, error);
  const parent1Values = readPersonForm("parent1");
  if (!parent1Values.familyName && !parent1Values.givenName) return showInlineError(error, "親1の姓または名のどちらかを入力してください。");
  if (!confirmDuplicatePerson(caseData, parent1Values)) return;
  pushUndoSnapshot("親を追加");

  const parent1Id = nextId(caseData.people, "personId", "p");
  let parent2Id = null;
  let spouseRelationId = null;
  const secondParentType = document.getElementById("secondParentType").value;
  const pendingPeople = [{ personId: parent1Id }];

  if (secondParentType === "new") {
    const parent2Values = readPersonForm("parent2");
    if (!parent2Values.familyName && !parent2Values.givenName) return showInlineError(error, "もう一人の親の姓または名のどちらかを入力してください。");
    if (!confirmDuplicatePerson(caseData, parent2Values)) return;
    parent2Id = nextId(caseData.people.concat(pendingPeople), "personId", "p");
    pendingPeople.push({ personId: parent2Id });
    spouseRelationId = nextId(caseData.spouseRelations, "spouseRelationId", "s");
    caseData.people.push(makePerson({ personId: parent1Id, ...parent1Values }));
    caseData.people.push(makePerson({ personId: parent2Id, ...parent2Values }));
    caseData.spouseRelations.push({ spouseRelationId, person1Id: parent1Id, person2Id: parent2Id, spouseStatus: "married", displayOrder: 1, note: "親追加時に作成" });
  } else {
    caseData.people.push(makePerson({ personId: parent1Id, ...parent1Values }));
    if (secondParentType === "unknown") {
      parent2Id = nextId(caseData.people.concat(pendingPeople), "personId", "p");
      spouseRelationId = nextId(caseData.spouseRelations, "spouseRelationId", "s");
      caseData.people.push(makePerson({ personId: parent2Id, familyName: "", givenName: "", gender: "unset", lifeStatus: "unset", relationshipLabel: "親(不明)", heirStatus: "unset", researchStatus: "checking" }));
      caseData.people[caseData.people.length - 1].isUnknownPerson = true;
      caseData.spouseRelations.push({ spouseRelationId, person1Id: parent1Id, person2Id: parent2Id, spouseStatus: "commonLaw", displayOrder: 1, note: "親追加時に作成した親(不明)との関係" });
    }
  }

  addParentGroup(caseData, person.personId, [parent1Id, parent2Id].filter(Boolean), groupKind, spouseRelationId, readParentAdoptionKind());
  touchCase(caseData);
  state.selectedPersonId = person.personId;
  state.detailMode = "view";
  render(false);
}

function saveParentLinkOnly(caseData, person, groupKind, error) {
  const spouseRelationId = document.getElementById("existingParentSpouseRelationId")?.value;
  const relation = caseData.spouseRelations.find((item) => item.spouseRelationId === spouseRelationId);
  if (!relation) return showInlineError(error, "登録済みの夫婦関係を選択してください。");
  const parentIds = [relation.person1Id, relation.person2Id];
  const duplicate = caseData.parentGroups.some((group) => {
    if (group.childId !== person.personId || group.groupKind !== groupKind) return false;
    const ids = caseData.parentLinks.filter((link) => link.parentGroupId === group.parentGroupId).map((link) => link.parentId).sort();
    return ids.join("+") === parentIds.slice().sort().join("+");
  });
  if (duplicate) return showInlineError(error, "同じ親との関係線はすでに登録されています。");
  pushUndoSnapshot("親の関係線のみ追加");
  addParentGroup(caseData, person.personId, parentIds, groupKind, spouseRelationId, readParentAdoptionKind());
  touchCase(caseData);
  state.selectedPersonId = person.personId;
  state.detailMode = "view";
  render(false);
}

function readParentAdoptionKind() {
  return document.getElementById("parentAdoptionKindInput")?.value || "ordinary";
}

function addParentGroup(caseData, childId, parentIds, groupKind, spouseRelationId, adoptionKind = null) {
  const parentGroupId = nextId(caseData.parentGroups, "parentGroupId", "pg");
  caseData.parentGroups.push({
    parentGroupId,
    childId,
    groupKind,
    adoptionKind: groupKind === "adoptive" ? adoptionKind || "ordinary" : null,
    spouseRelationId,
    diagramVisibility: "visible",
    displayOrder: nextChildDisplayOrder(caseData, spouseRelationId),
    note: ""
  });
  for (const parentId of parentIds) {
    caseData.parentLinks.push({ parentLinkId: nextId(caseData.parentLinks, "parentLinkId", "pl"), parentGroupId, parentId, isLegalConnectionSevered: false, note: "" });
  }
}

function savePersonEdit(caseData, person) {
  const values = readPersonForm("edit");
  if (!values.familyName && !values.givenName) return alert("姓または名のどちらかを入力してください。");
  pushUndoSnapshot("人物情報を修正");
  const isDecedent = person.personId === caseData.caseInfo.decedentPersonId;
  person.familyName = values.familyName;
  person.givenName = values.givenName;
  person.gender = values.gender;
  person.lifeStatus = isDecedent ? "deceased" : values.lifeStatus;
  person.birthDateWarekiCode = values.birthDateWarekiCode;
  person.deathDateWarekiCode = values.deathDateWarekiCode;
  person.relationshipLabel = isDecedent ? "被相続人" : values.relationshipLabel;
  person.heirStatus = isDecedent ? "unset" : values.heirStatus;
  person.researchStatus = isDecedent ? "checking" : values.researchStatus;
  touchCase(caseData);
  state.detailMode = "view";
  render(false);
}

function readPersonForm(prefix) {
  return {
    familyName: document.getElementById(`${prefix}FamilyName`).value.trim(),
    givenName: document.getElementById(`${prefix}GivenName`).value.trim(),
    gender: document.getElementById(`${prefix}Gender`).value,
    lifeStatus: document.getElementById(`${prefix}LifeStatus`).value,
    birthDateWarekiCode: warekiDateInputCode(document.getElementById(`${prefix}BirthDate`)),
    deathDateWarekiCode: warekiDateInputCode(document.getElementById(`${prefix}DeathDate`)),
    relationshipLabel: document.getElementById(`${prefix}Relationship`).value.trim(),
    heirStatus: document.getElementById(`${prefix}HeirStatus`).value,
    researchStatus: document.getElementById(`${prefix}ResearchStatus`).value
  };
}


function bindWarekiDateInput(input) {
  if (!input) return;
  input.addEventListener("focus", () => {
    input.value = warekiDateInputCode(input);
  });
  input.addEventListener("blur", () => {
    const code = normalizeWarekiDateCode(input.value);
    input.dataset.warekiCode = code;
    input.value = code ? formatWarekiDateCode(code) : "";
  });
}

function refreshWarekiDateInputs(prefix) {
  for (const id of [`${prefix}BirthDate`, `${prefix}DeathDate`]) {
    const input = document.getElementById(id);
    if (!input) continue;
    const code = normalizeWarekiDateCode(input.value);
    input.dataset.warekiCode = code;
    input.value = code ? formatWarekiDateCode(code) : "";
  }
}

function warekiDateInputCode(input) {
  if (!input) return "";
  return normalizeWarekiDateCode(input.dataset.warekiCode || input.value);
}

function normalizeWarekiDateCode(value) {
  const digits = toAsciiDigits(value).replace(/\D/g, "");
  return /^\d{7}$/.test(digits) && WAREKI_ERAS[digits[0]] ? digits : "";
}

function toAsciiDigits(value) {
  return String(value || "").replace(/[?-?]/g, (char) => String(char.charCodeAt(0) - 0xff10));
}

const WAREKI_ERAS = {
  1: "明治",
  2: "大正",
  3: "昭和",
  4: "平成",
  5: "令和"
};

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
function showInlineError(element, message) { element.hidden = false; element.textContent = message; }
function setDetailMode(mode) { state.detailMode = mode; render(false); }

function appendSelectedPersonHeader(caseData, person) {
  const name = document.createElement("div");
  name.className = "person-name-large";
  name.textContent = `現在選択中：${displayName(person)}`;
  els.detailContent.appendChild(name);
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = printHeirLabel(caseData, person) || heirStatusLabel(person.heirStatus);
  els.detailContent.appendChild(badge);
}

function appendJsonPreview(caseData) {
  const section = detailSection("JSONプレビュー");
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "内部データを表示";
  const pre = document.createElement("pre");
  pre.className = "json-preview";
  pre.textContent = JSON.stringify(caseData, null, 2);
  details.appendChild(summary);
  details.appendChild(pre);
  section.appendChild(details);
  els.detailContent.appendChild(section);
}

function detailSection(title) { const section = document.createElement("section"); section.className = "detail-section"; const h3 = document.createElement("h3"); h3.textContent = title; section.appendChild(h3); return section; }
function detailTable(rows) { const table = document.createElement("table"); table.className = "detail-table"; const tbody = document.createElement("tbody"); rows.forEach(([key, value]) => { const tr = document.createElement("tr"), th = document.createElement("th"), td = document.createElement("td"); th.textContent = key; td.textContent = value || ""; tr.appendChild(th); tr.appendChild(td); tbody.appendChild(tr); }); table.appendChild(tbody); return table; }

function relationRows(caseData, personId) {
  const peopleById = mapBy(caseData.people, "personId");
  const spouses = getSpouseRelations(caseData, personId).map((relation) => `${displayName(peopleById.get(otherSpouseId(relation, personId)))}（${spouseStatusLabel(relation.spouseStatus)}）`);
  const rows = [["配偶者", spouses.join("、") || "なし"]];
  const parentRows = [];
  for (const group of caseData.parentGroups.filter((g) => g.childId === personId)) {
    const names = caseData.parentLinks.filter((link) => link.parentGroupId === group.parentGroupId).map((link) => displayName(peopleById.get(link.parentId))).join("・");
    parentRows.push(`${groupKindLabel(group)}: ${names}`);
  }
  rows.push(["親", parentRows.join(" / ") || "なし"]);
  const childRows = [];
  for (const group of caseData.parentGroups) {
    const links = caseData.parentLinks.filter((link) => link.parentGroupId === group.parentGroupId);
    if (links.some((link) => link.parentId === personId)) childRows.push(`${displayName(peopleById.get(group.childId))}（${groupKindLabel(group)}）`);
  }
  rows.push(["子", childRows.join("、") || "なし"]);
  return rows;
}

function exportJson() {
  const caseData = currentCase();
  if (!caseData) return;
  touchCase(caseData);
  const blob = new Blob([JSON.stringify(caseData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = buildExportFileName(caseData);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildExportFileName(caseData) {
  const decedent = caseData.people.find((p) => p.personId === caseData.caseInfo.decedentPersonId);
  const name = sanitizeFileName(displayName(decedent).replace(/\s+/g, "")) || "被相続人";
  const caseNo = sanitizeFileName(caseData.caseInfo.caseNo || "管理番号なし");
  const now = new Date();
  const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}_${pad2(now.getHours())}${pad2(now.getMinutes())}`;
  return `相続関係図_${caseNo}_${name}_${stamp}.json`;
}

function requestLoadJson(fromStart) {
  if (!fromStart && state.caseData && !confirm("現在の入力中データは破棄されます。JSONファイルを読み込んでよろしいですか？")) return;
  els.jsonFileInput.value = "";
  els.jsonFileInput.click();
}

function handleJsonFileSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  showLoadingSteps([{ text: "ファイルを選択", status: "done" }, { text: "JSON形式を確認", status: "current" }, { text: "必要項目を確認", status: "" }, { text: "関係図を描画中", status: "" }]);
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || ""));
      showLoadingSteps([{ text: "ファイルを選択", status: "done" }, { text: "JSON形式を確認", status: "done" }, { text: "必要項目を確認", status: "current" }, { text: "関係図を描画中", status: "" }]);
      const errors = validateImportData(parsed);
      if (errors.length > 0) throw new Error(`このJSONは、相続関係図ツールのデータとして必要な項目が不足しています。\n\n不足している項目:\n- ${errors.join("\n- ")}`);
      if (!parsed.printSettings) parsed.printSettings = { ...DEFAULT_PRINT_SETTINGS };
      showLoadingSteps([{ text: "ファイルを選択", status: "done" }, { text: "JSON形式を確認", status: "done" }, { text: "必要項目を確認", status: "done" }, { text: "関係図を描画中", status: "current" }]);
      window.setTimeout(() => { hideLoadingSteps(); openCase(parsed, parsed.caseInfo.decedentPersonId || parsed.people[0]?.personId, true); }, 250);
    } catch (error) {
      window.setTimeout(() => { hideLoadingSteps(); alert(error.message || "JSONを読み込めませんでした。"); }, 150);
    }
  };
  reader.onerror = () => { hideLoadingSteps(); alert("ファイルを読み込めませんでした。"); };
  reader.readAsText(file, "utf-8");
}

function validateImportData(data) {
  const missing = [];
  if (!data || typeof data !== "object") return ["caseInfo", "people", "parentGroups", "parentLinks", "spouseRelations"];
  if (!data.caseInfo) missing.push("caseInfo");
  if (!Array.isArray(data.people)) missing.push("people");
  if (!Array.isArray(data.parentGroups)) missing.push("parentGroups");
  if (!Array.isArray(data.parentLinks)) missing.push("parentLinks");
  if (!Array.isArray(data.spouseRelations)) missing.push("spouseRelations");
  return missing;
}

function showLoadingSteps(steps) {
  els.loadingSteps.replaceChildren();
  for (const step of steps) {
    const li = document.createElement("li");
    li.className = step.status;
    li.textContent = step.status === "done" ? `✓ ${step.text}` : step.status === "current" ? `→ ${step.text}` : step.status === "error" ? `× ${step.text}` : step.text;
    els.loadingSteps.appendChild(li);
  }
  els.loadingOverlay.hidden = false;
}

function hideLoadingSteps() { els.loadingOverlay.hidden = true; }
function touchCase(caseData) { caseData.caseInfo.updatedAt = new Date().toISOString(); caseData.caseInfo.toolVersion = "ver12-prototype"; updateCaseTitle(caseData); }
function nextId(items, field, prefix) { let max = 0; for (const item of items) { const value = String(item[field] || ""); if (value.startsWith(prefix)) { const number = Number(value.slice(prefix.length)); if (Number.isFinite(number)) max = Math.max(max, number); } } return `${prefix}${String(max + 1).padStart(3, "0")}`; }
function nextSpouseDisplayOrder(caseData, personId) { return Math.max(0, ...getSpouseRelations(caseData, personId).map((relation) => Number(relation.displayOrder || 0))) + 1; }
function nextChildDisplayOrder(caseData, spouseRelationId) { return Math.max(0, ...caseData.parentGroups.filter((group) => group.spouseRelationId === spouseRelationId).map((group) => Number(group.displayOrder || 0))) + 1; }
function centerPerson(personId) { const layout = state.lastLayout; if (!layout || !personId) return; const pos = layout.positions.get(personId); if (!pos) return; els.svgScroll.scrollLeft = Math.max(0, pos.x * state.zoom - els.svgScroll.clientWidth / 2); els.svgScroll.scrollTop = Math.max(0, pos.y * state.zoom - els.svgScroll.clientHeight / 2); }
function getSpouseRelations(caseData, personId) { return caseData.spouseRelations.filter((relation) => relation.person1Id === personId || relation.person2Id === personId); }
function otherSpouseId(relation, personId) { return relation.person1Id === personId ? relation.person2Id : relation.person1Id; }
function compareSpouseForLayout(a, b) { const rank = { married: 1, commonLaw: 2, divorced: 3 }; const orderA = a.displayOrder ?? 999, orderB = b.displayOrder ?? 999; if (orderA !== orderB) return orderA - orderB; if (rank[a.spouseStatus] !== rank[b.spouseStatus]) return rank[a.spouseStatus] - rank[b.spouseStatus]; return a.spouseRelationId.localeCompare(b.spouseRelationId); }
function compareChildGroups(a, b, peopleById) { const orderA = a.displayOrder ?? 999, orderB = b.displayOrder ?? 999; if (orderA !== orderB) return orderA - orderB; return displayName(peopleById.get(a.childId)).localeCompare(displayName(peopleById.get(b.childId)), "ja"); }
function displayName(person) { if (!person) return ""; const parts = [person.familyName, person.givenName].filter(Boolean); if (parts.length > 0) return parts.join("　"); return "(氏名未入力)"; }
function personSymbol(person) {
  if (!person) return "";
  const lifeStatus = effectiveLifeStatus(person);
  if (person.gender === "male" && lifeStatus === "alive") return "\u25cb";
  if (person.gender === "male" && lifeStatus === "deceased") return "\u25cf";
  if (person.gender === "female" && lifeStatus === "alive") return "\u25b3";
  if (person.gender === "female" && lifeStatus === "deceased") return "\u25b2";
  return lifeStatus === "deceased" ? "\u25cf" : "\u25cb";
}
function effectiveLifeStatus(person) { return person?.deathDateWarekiCode || person?.lifeStatus === "deceased" ? "deceased" : "alive"; }
function printHeirLabel(caseData, person) { if (person.personId === caseData.caseInfo.decedentPersonId) return "\u88ab\u76f8\u7d9a\u4eba"; if (person.heirStatus === "heir") return "\u76f8\u7d9a\u4eba"; if (person.heirStatus === "nonHeir") return "\u975e\u76f8\u7d9a\u4eba"; if (person.heirStatus === "renounced") return "\u76f8\u7d9a\u653e\u68c4"; return ""; }
function cardFill(caseData, person) { if (person.lifeStatus === "deceased" && person.heirStatus === "heir") return "#fee2e2"; if (person.personId === caseData.caseInfo.decedentPersonId) return "#ede9fe"; if (person.researchStatus === "checking") return "#fef3c7"; if (person.heirStatus === "heir") return "#e0f2fe"; if (person.lifeStatus === "deceased") return "#e5e7eb"; return "#ffffff"; }
function groupKindLabel(group) { return group.groupKind === "biological" ? "実親" : "養親"; }
function genderLabel(value) { return { male: "男性", female: "女性", unset: "未設定" }[value] || value || ""; }
function lifeStatusLabel(value) { return { alive: "生存", deceased: "死亡", unset: "未設定" }[value] || value || ""; }
function heirStatusLabel(value) { return { heir: "\u76f8\u7d9a\u4eba", nonHeir: "\u975e\u76f8\u7d9a\u4eba", renounced: "\u76f8\u7d9a\u653e\u68c4", unset: "\u672a\u8a2d\u5b9a" }[value] || value || ""; }
function researchStatusLabel(value) { return { checking: "調査中", completed: "調査完了", unset: "未設定" }[value] || value || ""; }
function spouseStatusLabel(value) { return { married: "婚姻中", divorced: "離婚", commonLaw: "内縁" }[value] || value || ""; }
function drawCenteredLines(group, text, centerX, startY, fontSize, lineHeight, maxLines, maxWidth, fill, weight) { const lines = wrapText(text, Math.max(4, Math.floor(maxWidth / (fontSize * 0.72))), maxLines); const firstY = startY - ((lines.length - 1) * lineHeight) / 2; lines.forEach((line, index) => drawText(group, line, centerX, firstY + index * lineHeight, fontSize, fill, weight, "middle")); }
function drawText(group, text, x, y, fontSize, fill, weight = 400, anchor = "start") { const node = svgEl("text", { x, y, fill, "font-size": fontSize, "font-weight": weight, "text-anchor": anchor }); node.textContent = text || ""; group.appendChild(node); return node; }
function wrapText(text, maxChars, maxLines) { const source = String(text || ""); if (source.length <= maxChars) return [source]; const lines = []; let rest = source; while (rest.length > 0 && lines.length < maxLines) { if (lines.length === maxLines - 1 && rest.length > maxChars) { lines.push(rest.slice(0, Math.max(1, maxChars - 1)) + "…"); break; } lines.push(rest.slice(0, maxChars)); rest = rest.slice(maxChars); } return lines; }
function actionButton(text, onClick, className = "") { const button = document.createElement("button"); button.type = "button"; button.textContent = text; if (className) button.className = className; button.addEventListener("click", onClick); return button; }
function disabledButton(text) { const button = document.createElement("button"); button.type = "button"; button.textContent = text; button.disabled = true; return button; }
function hintBox(text) { const div = document.createElement("div"); div.className = "hint-box"; div.textContent = text; return div; }
function warningBox(text) { const div = document.createElement("div"); div.className = "warning-box"; div.textContent = text; return div; }
function svgEl(tag, attrs = {}) { const el = document.createElementNS(SVG_NS, tag); for (const [key, value] of Object.entries(attrs)) { if (value !== undefined && value !== null) el.setAttribute(key, String(value)); } return el; }
function mapBy(items, key) { return new Map(items.map((item) => [item[key], item])); }
function groupBy(items, key) { const map = new Map(); for (const item of items) { const value = item[key]; if (!map.has(value)) map.set(value, []); map.get(value).push(item); } return map; }
function average(values) { return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length; }
function pad2(value) { return String(value).padStart(2, "0"); }
function sanitizeFileName(value) { return String(value || "").replace(/[\\/:*?"<>|]/g, "").trim(); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char])); }
function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#96;"); }
