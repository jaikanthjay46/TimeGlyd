import lunr from "lunr";
import { City, cityMap, searchIndex } from "../utils/search-index";
import { convertHourToString } from "../utils/time";

export type CitySearchResult = {
  timeZoneId: string;
  timeZoneOffset: number;
  fullName: string;
};

export const formatCityName = (city: City) => {
  if (city.type === "tz" || !city.country) {
    return `${city.name}, ${convertHourToString(city.offset)}`;
  }
  return `${city.name}, ${city.country.toUpperCase()}  ${convertHourToString(
    city.offset
  )}`;
};

export const findCity = (text: string): CitySearchResult | undefined => {
  if (text.trim().length <= 3) {
    return undefined;
  }

  let results: lunr.Index.Result[];
  try {
    results = searchIndex.search(text);
    results.sort((leftResult, rightResult) => {
      const left = cityMap.get(leftResult.ref) ?? { popularity: 0 };
      const right = cityMap.get(rightResult.ref) ?? { popularity: 0 };
      return (
        rightResult.score * right.popularity -
        leftResult.score * left.popularity
      );
    });
  } catch {
    results = [];
  }

  const city =
    results.length > 0
      ? cityMap.get(results[0].ref)
      : ({ offset: 0, name: "UTC", timezone: "UTC", type: "tz" } as City);

  if (!city) {
    return undefined;
  }

  return {
    timeZoneId: city.timezone,
    timeZoneOffset: city.offset,
    fullName: formatCityName(city),
  };
};
