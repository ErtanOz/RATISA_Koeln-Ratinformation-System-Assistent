// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  PaperSearchIndexDocument,
  queryPaperSearchIndex as queryNetlifyPaperSearchIndex,
} from "../../mcp-server-netlify/src/paperSearchIndex";
import { queryPaperSearchIndex as queryStdioPaperSearchIndex } from "../../mcp-server/src/paperSearchIndex";

const buildIndex = (): PaperSearchIndexDocument => ({
  metadata: {
    generatedAt: "2026-03-13T00:00:00.000Z",
    itemCount: 5,
    source: "test",
    isPartial: false,
  },
  items: [
    {
      id: "paper-1",
      name: "Radverkehr Konzept",
      reference: "2024/123",
      paperType: "Mitteilung",
      dateKey: "2024-06-12",
      searchText: "radverkehr konzept 2024/123 mitteilung",
    },
    {
      id: "paper-2",
      name: "Radweg Ausbau",
      reference: "2024/124",
      paperType: "Antrag nach § 3 der GeschO des Rates",
      dateKey: "2024-06-10",
      searchText: "radweg ausbau 2024/124 antrag nach § 3 der gescho des rates",
    },
    {
      id: "paper-3",
      name: "Schulbau Programm",
      reference: "2023/050",
      paperType: "Beschlussvorlage",
      dateKey: "2023-02-20",
      searchText: "schulbau programm 2023/050 beschlussvorlage",
    },
    {
      id: "paper-4",
      name: "Radverkehr",
      reference: "2022/010",
      paperType: "Mitteilung",
      dateKey: "2022-04-04",
      searchText: "radverkehr 2022/010 mitteilung",
    },
    {
      id: "paper-5",
      name: "Radverkehr Konzept Fortschreibung",
      reference: "2025/001",
      paperType: "Mitteilung",
      dateKey: "2025-01-15",
      searchText: "radverkehr konzept fortschreibung 2025/001 mitteilung",
    },
  ],
});

const implementations = [
  {
    name: "stdio",
    query: queryStdioPaperSearchIndex,
  },
  {
    name: "netlify",
    query: queryNetlifyPaperSearchIndex,
  },
];

describe.each(implementations)("paperSearchIndex ($name)", ({ query }) => {
  it("returns distinct results for relevant and nonsense queries", () => {
    const weird = query(buildIndex(), {
      query: "zzzz_UNLIKELY_QUERY_2026_ABC987",
      limit: 5,
    });
    const relevant = query(buildIndex(), {
      query: "radverkehr",
      limit: 5,
    });

    expect(weird.items).toEqual([]);
    expect(relevant.items.map((item) => item.id)).toEqual([
      "paper-4",
      "paper-5",
      "paper-1",
    ]);
  });

  it("preserves type filtering and pagination", () => {
    const filtered = query(buildIndex(), {
      query: "radweg",
      paperType: "Antrag",
      limit: 5,
    });

    expect(filtered.totalMatches).toBe(1);
    expect(filtered.items[0]?.id).toBe("paper-2");

    const pageOne = query(buildIndex(), {
      query: "radverkehr",
      offset: 0,
      limit: 2,
    });
    const pageTwo = query(buildIndex(), {
      query: "radverkehr",
      offset: 2,
      limit: 2,
    });

    expect(pageOne.items.map((item) => item.id)).toEqual(["paper-4", "paper-5"]);
    expect(pageTwo.items.map((item) => item.id)).toEqual(["paper-1"]);
  });
});
