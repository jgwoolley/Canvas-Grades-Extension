/**
 * Pure grade maths. Loaded as a plain script by popup.html (no DOM access).
 */

const LETTERS = [[93, 'A'], [90, 'A-'], [87, 'B+'], [83, 'B'], [80, 'B-'], [77, 'C+'], [73, 'C'], [70, 'C-'], [67, 'D+'], [63, 'D'], [60, 'D-'], [0, 'F']];

/** @param {number | null} fraction */
function letterFor(fraction) {
    if (fraction == null || !Number.isFinite(fraction)) return '–';
    const pct = fraction * 100;
    return LETTERS.find(([min]) => pct >= min - 1e-9)[1];
}

/** Not final: partially graded quiz or grade the instructor hasn't posted. Works on older captures via scoreRaw. */
function isIncomplete(a) {
    return a.incomplete ?? /has not posted/i.test(a.scoreRaw || '');
}

/**
 * Estimates a course grade.
 *  - current: graded work only (ungraded groups drop out, weights renormalised) - what Canvas shows.
 *  - best / worst: remaining ungraded assignments all score full marks / zero
 *    (partly graded ones keep the points already earned in the worst case).
 *
 * @param {Assignment[]} grades
 * @param {Group[]} groups
 */
function computeCourse(grades, groups) {
    const map = {};
    for (const g of groups) {
        map[g.group] = { ...g, name: g.group, earned: 0, possible: 0, pending: 0, floor: 0, graded: 0, ungraded: 0 };
    }
    const weighted = groups.some(g => g.weight > 0);
    const warnings = [];
    const partial = [];
    const flat = { name: 'All assignments', weight: 1, earned: 0, possible: 0, pending: 0, floor: 0, graded: 0, ungraded: 0 };

    for (const a of grades) {
        const bucket = weighted ? map[a.context] : flat;
        if (!bucket) {
            warnings.push(`No assignment group "${a.context}" for "${a.name}"`);
            continue;
        }
        if (a.total == null) {
            warnings.push(`No point total for "${a.name}"`);
            continue;
        }
        if (isIncomplete(a)) {
            // Partly graded (e.g. quiz with only the auto-graded part scored): leave it out of the
            // current grade. Points earned so far are a floor, used only for the worst case.
            bucket.pending += a.total;
            bucket.floor += a.score ?? 0;
            bucket.ungraded++;
            bucket.partial = (bucket.partial || 0) + 1;
            partial.push(a.name);
        } else if (a.score == null) {
            bucket.pending += a.total;
            bucket.ungraded++;
        } else {
            bucket.earned += a.score;
            bucket.possible += a.total;
            bucket.graded++;
        }
    }

    const list = weighted ? Object.values(map) : [flat];
    for (const g of list) g.percent = g.possible > 0 ? g.earned / g.possible : null;

    const blend = (pick) => {
        let sum = 0, w = 0;
        for (const g of list) {
            const r = pick(g);
            if (r == null) continue;
            sum += g.weight * r;
            w += g.weight;
        }
        return w > 0 ? sum / w : null;
    };

    const current = blend(g => g.percent);
    const best = blend(g => g.possible + g.pending > 0 ? (g.earned + g.pending) / (g.possible + g.pending) : null);
    const worst = blend(g => g.possible + g.pending > 0 ? (g.earned + g.floor) / (g.possible + g.pending) : null);

    return {
        weighted, groups: list, current, best, worst, warnings, partial,
        letter: letterFor(current),
        gradedCount: list.reduce((n, g) => n + g.graded, 0),
        ungradedCount: list.reduce((n, g) => n + g.ungraded, 0),
    };
}

/** Class name for a saved course; re-derived from the stored page title so older captures get fixed too. */
function courseName(course) {
    const m = (course.raw?.title || '').match(/^Grades(?: for [^:]*)?:\s*(.+)$/);
    return m ? m[1].trim() : course.name;
}
