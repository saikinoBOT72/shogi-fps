// Firebase の設定（Firebase コンソール → プロジェクトの設定 → マイアプリ で出る firebaseConfig）
// 公開されても大丈夫な値。守りはデータベースの決まり（firestore.rules）で行う
// null のあいだはアカウント機能を出さない
export const firebaseConfig: Record<string, string> | null = {
  apiKey: 'AIzaSyBil8pQYCpbrRTVnWYBvizpowVHvdXgHOc',
  authDomain: 'shogi-fps.firebaseapp.com',
  projectId: 'shogi-fps',
  storageBucket: 'shogi-fps.firebasestorage.app',
  messagingSenderId: '504882381429',
  appId: '1:504882381429:web:f4e70ae4ae4ea991952e3c',
};
