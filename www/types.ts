export interface Project {
  id: string;
  name: string;
  ownerId: string;
  data: {
    v: number;
    data: string;
  };
  createdAt: number;
}
