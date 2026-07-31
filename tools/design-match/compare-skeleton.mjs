/**
 * The blocking gate. Answers one question: "is this the same structure?" — not
 * "does it look the same". A failure here means the wrong component or the wrong
 * layout was chosen, which no amount of value tuning can fix, so the loop must
 * stop rather than proceed to pixels.
 */

const DEFAULT_SIZE_TOLERANCE = 0.02;

// Position, not just size: two equal-sized siblings swapped in place are a
// real structural difference (a reordering) that role/child-order comparison
// alone cannot see once matchRole collapses both to the same generic value —
// rel.x/rel.y are what catches it.
const AXIS_LABEL = { w: "šířka", h: "výška", x: "pozice X", y: "pozice Y" };

function childPath(parentPath, child, index) {
  return `${parentPath}/${child.role}[${index}]`;
}

function walk(design, app, path, tolerance, findings) {
  if (design.layout.mode !== app.layout.mode) {
    findings.push({
      path,
      kind: "layout-mode",
      expected: design.layout.mode,
      actual: app.layout.mode,
      message: `layout mód: ${design.layout.mode} vs ${app.layout.mode}`,
    });
    return; // everything below is being laid out by a different engine — descending adds noise
  }

  if (design.layout.mode === "grid" && design.layout.columns !== app.layout.columns) {
    findings.push({
      path,
      kind: "columns",
      expected: design.layout.columns,
      actual: app.layout.columns,
      message: `počet sloupců: ${design.layout.columns} vs ${app.layout.columns}`,
    });
  }

  if (design.children.length !== app.children.length) {
    findings.push({
      path,
      kind: "child-count",
      expected: design.children.length,
      actual: app.children.length,
      message: `počet potomků: ${design.children.length} vs ${app.children.length}`,
    });
    return; // pairing children is meaningless once the counts differ
  }

  // matchRole, not role: a class name is a naming convention, not a structural
  // commitment, so only tag- or author-declared roles decide the gate here.
  const designRoles = design.children.map((c) => c.matchRole).join(",");
  const appRoles = app.children.map((c) => c.matchRole).join(",");
  if (designRoles !== appRoles) {
    findings.push({
      path,
      kind: "child-order",
      expected: designRoles,
      actual: appRoles,
      message: `pořadí/role potomků: [${designRoles}] vs [${appRoles}]`,
    });
    return;
  }

  design.children.forEach((designChild, index) => {
    const appChild = app.children[index];
    const here = childPath(path, designChild, index);
    for (const axis of ["w", "h", "x", "y"]) {
      const delta = Math.abs(designChild.rel[axis] - appChild.rel[axis]);
      if (delta > tolerance) {
        findings.push({
          path: here,
          kind: "size",
          expected: designChild.rel[axis],
          actual: appChild.rel[axis],
          message: `${AXIS_LABEL[axis]} ${designChild.rel[axis]} rodiče v designu, ${appChild.rel[axis]} v implementaci`,
        });
      }
    }
    walk(designChild, appChild, here, tolerance, findings);
  });
}

export function compareSkeletons(design, app, options = {}) {
  const tolerance = options.sizeTolerance ?? DEFAULT_SIZE_TOLERANCE;
  const findings = [];

  // Same matchRole-not-role rule as the child-order check below, for the root.
  if (design.matchRole !== app.matchRole) {
    findings.push({
      path: design.role,
      kind: "role",
      expected: design.matchRole,
      actual: app.matchRole,
      message: `role kořene: ${design.matchRole} vs ${app.matchRole}`,
    });
  }

  walk(design, app, design.role, tolerance, findings);
  return { pass: findings.length === 0, findings };
}
