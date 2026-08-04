export const lightColors = {
  primary: '#C9342F', red: '#C9342F', accent: '#F36B35',
  background: '#F8F7F4', surface: '#FFFFFF', border: '#DEDCD5',
  success: '#18794E', warning: '#A15C00', error: '#B42318', info: '#175CD3',
  gray: { 0: '#FFFFFF', 50: '#F8F7F4', 100: '#F0EFEB', 200: '#DEDCD5', 300: '#C2BFB7', 400: '#96928A', 500: '#706C65', 600: '#54514B', 700: '#3B3935', 800: '#272622', 900: '#171714' }
} as const;

export const darkColors = {
  primary: '#FF716B', red: '#FF716B', accent: '#FF8A54',
  background: '#121210', surface: '#1D1C19', border: '#3C3A35',
  success: '#5BD19B', warning: '#F6C453', error: '#FF8A80', info: '#84ADFF',
  gray: { 0: '#121210', 50: '#1D1C19', 100: '#272622', 200: '#3C3A35', 300: '#54514B', 400: '#706C65', 500: '#96928A', 600: '#B7B3AA', 700: '#D3D0C8', 800: '#E8E6E0', 900: '#FAF9F6' }
} as const;

export type ColorMode = 'light' | 'dark';
