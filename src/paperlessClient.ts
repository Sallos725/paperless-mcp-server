import axios from "axios";
export class PaperlessClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  // Helper function to build url
  buildUrl(
      query?: string,
      tagsName?: string[],
      ordering?: string,
      documentId?: number,
      created?: string,
      added_after?: string,
      added_before?: string
  ) {
      let url = `${this.baseUrl}/api/documents/`;
      if (query) {
          url += `?query=${query}`;
      }

      if (tagsName && tagsName.length === 1) {
          url += (url.includes('?') ? '&' : '?') + `tags__name__icontains=${tagsName[0]}`
      }

      /*
      if (created) {
          url += (url.includes('?') ? '&' : '?') + `created__gte=${created}`
      }
      */
      if (documentId) {
          url += (url.includes('?') ? '&' : '?') + `id=${documentId}`;
      }
      if (added_after) {
          url += (url.includes('?') ? '&' : '?') + `added__gte=${added_after}`;
      }
      if (added_before) {
          url += (url.includes('?') ? '&' : '?') + `added__lte=${added_before}`;
      }
      if (ordering) {
          url += (url.includes('?') ? '&' : '?') + `ordering=${ordering}`;
      }
      return url;
  }

  private async fetchDocuments(apiUrl: string): Promise<any> {
      try {
          const response = await axios.get(
              apiUrl, {
                  headers: {
                      'Authorization': `Token ${this.apiKey}`
                  }
              }
          );

          return response.data;
      }
      catch (e) {
          if (axios.isAxiosError(e) && e.response?.status === 401) {
              throw new Error(`Unauthorized: Please check your API key`);
          }
          console.error(`Error fetching documents: `, e);
          throw e;
      }
  }
}