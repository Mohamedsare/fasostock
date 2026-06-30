/** Un tutoriel vidéo (table `public.tutorials`). */
export type Tutorial = {
  id: string;
  moduleKey: string;
  title: string;
  description: string | null;
  youtubeUrl: string;
  sortOrder: number;
  isActive: boolean;
};

export type TutorialInput = {
  moduleKey: string;
  title: string;
  description: string;
  youtubeUrl: string;
  sortOrder: number;
  isActive: boolean;
};
