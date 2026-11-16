type Client = { id: string; name: string; email: string | null };
type ClientPage = { data: Client[]; total: number };

// Used by both the task form and its client filter, independently of task paging.
export async function loadAllClients(
  request: (path: string) => Promise<ClientPage>,
): Promise<Client[]> {
  const clients: Client[] = [];
  const limit = 100;
  for (let page = 1; ; page += 1) {
    const result = await request(`clients?page=${page}&limit=${limit}`);
    clients.push(...result.data);
    if (clients.length >= result.total || result.data.length === 0)
      return clients;
  }
}
