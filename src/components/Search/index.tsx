import { useEffect, useState, KeyboardEvent } from "react";
import { City, cityMap, searchIndex } from "../../utils/search-index";
import { convertHourToString } from "../../utils/time";
import "./search.scss";
import lunr from "lunr";
import { WallClock, settingsManager } from "../../config/settings-manager";

interface SearchResult {
  timeZoneId: string;
  timeZoneOffset: number;
  fullName: string;
}

type Props = {
  updateNewClocks: (clocks: WallClock[]) => void
}

function Search({updateNewClocks}: Props) {
  const [text, setText] = useState("");
  const [searchResult, setSearchResult] = useState<SearchResult>();

  const handleInput = (e: any) => {
    const value = e.target.value;
    setText(value);
  };

  const formatFullName = (city: City) => {
    if (city.type == "tz" || !city.country) {
      return `${city.name}, ${convertHourToString(city.offset)}`;
    } else {
      return `${
        city.name
      }, ${city.country.toUpperCase()}  ${convertHourToString(city.offset)}`;
    }
  };

  useEffect(() => {
    if (!text || text == "") {
      setSearchResult(undefined);
      return;
    }

    if (text.length <= 3) return;

    let results: lunr.Index.Result[];
    try {
      results = searchIndex.search(text);
      results = results.sort(function (a, b) {
        const left = cityMap.get(a.ref) ?? { popularity: 0 };
        const right = cityMap.get(b.ref) ?? { popularity: 0 };

        return a.score * left.popularity - b.score * right.popularity;
      });
    } catch {
      results = [];
    }
    // console.log(results);
    const city =
      results.length > 0
        ? cityMap.get(results[0].ref)
        : ({ offset: 0, name: "UTC" } as City);

    if (!city) {
      setSearchResult(undefined);
      return;
    }

    const searchResult: SearchResult = {
      timeZoneId: city.timezone,
      timeZoneOffset: city.offset,
      fullName: formatFullName(city),
    };

    setSearchResult(searchResult);
  }, [text]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    console.log(event.key)
    if (event.key === "Enter") {
      const clocks = settingsManager.getCache('clocks');
      clocks.push({clockName: searchResult?.fullName ?? 'UTC', timezoneOffsetHours: searchResult?.timeZoneOffset ?? 0});
      updateNewClocks(clocks);
      settingsManager.setCache('clocks', clocks);
      settingsManager.syncCache();
    }
  };

  return (
    <section className="search">
      <input
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        type="input"
        name="q"
        placeholder="Search"
        spellCheck="false"
      />
      <label>{searchResult?.fullName}</label>
    </section>
  );
}

export default Search;
