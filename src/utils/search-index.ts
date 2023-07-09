import lunr from "lunr";
import cities from "../assets/cities.json";



export interface City {
    id: number;
    country: string;
    city: string;
    name: string;
    type: string;
    timezone: string;
    offset: number;
    popularity: number;
}


export function initializeSearchIndex(): lunr.Index {
    const index: lunr.Index = lunr(function () {
        this.field('timezone', {boost: 3});
        this.field('name', { boost: 3 });
        this.field('country', {boost: 1.5});
        this.field('city', {boost: 1});

    
        this.ref('id');

         
        (cities as City[]).filter((city) => city.type !== "airport").forEach((city) => {
            this.add(city);
        });
    });
    return index;
}

export const cityMap = new Map((cities as City[]).map( (value) => {
    return [value.id.toString(), value];
}));

export const searchIndex: lunr.Index = initializeSearchIndex();