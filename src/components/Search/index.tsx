import { useEffect, useState, KeyboardEvent } from "react";
import "./Search.scss";
import { addClock } from "../../config/settings-client";
import {
  CitySearchResult,
  findCity,
} from "../../config/city-search";

function Search() {
  const [text, setText] = useState("");
  const [searchResult, setSearchResult] = useState<CitySearchResult>();

  const handleInput = (e: any) => {
    const value = e.target.value;
    setText(value);
  };

  useEffect(() => {
    setSearchResult(findCity(text));
  }, [text]);

  const handleKeyDown = async (
    event: KeyboardEvent<HTMLInputElement>
  ): Promise<void> => {
    if (event.key === "Enter") {
      try {
        await addClock(
          searchResult?.fullName ?? "UTC",
          searchResult?.timeZoneOffset ?? 0,
          searchResult?.timeZoneId ?? "UTC"
        );
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
