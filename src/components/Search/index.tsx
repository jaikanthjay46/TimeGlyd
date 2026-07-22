import { useEffect, useState, KeyboardEvent } from "react";
import { City, cityMap, searchIndex } from "../../utils/search-index";
import { convertHourToString } from "../../utils/time";
import "./Search.scss";
import lunr from "lunr";
import { WallClock, updateSettings } from "../../config/settings-manager";

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
        return b.score * right.popularity - a.score * left.popularity;
      });
    } catch {
      results = [];
    }
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

  const handleKeyDown = async (
    event: KeyboardEvent<HTMLInputElement>
  ): Promise<void> => {
    if (event.key === "Enter") {
      try {
        const clocks = await updateSettings((settings) => {
          const updatedClocks = [
            ...settings.clocks,
            {
              clockName: searchResult?.fullName ?? "UTC",
              timezoneOffsetHours: searchResult?.timeZoneOffset ?? 0,
              timeZoneId: searchResult?.timeZoneId ?? "UTC",
            },
          ];
          settings.clocks = updatedClocks;
          return updatedClocks;
        });
        updateNewClocks(clocks);
      } catch (error) {
        console.error("Unable to save the new clock", error);
      }
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
