// Transfer a picture-heavy report without putting every image in one Playwright pipe message.

/** Reads the report's text and problems, then each pictured moment in order. */
export async function readPicturedReport(report) {
  const result = await report.evaluate(({ moments, ...rest }) => ({ ...rest, count: moments.length }));
  const moments = [];
  for (let index = 0; index < result.count; index++) {
    moments.push(await report.evaluate((value, index) => value.moments[index], index));
  }
  const { count, ...rest } = result;
  return { ...rest, moments };
}
