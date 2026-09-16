import { useNavigate } from 'react-router';

import { useShellContext } from '../shell/shellContext';
import { RecipeEntryForm } from './RecipeEntryForm';

export function RecipeNewPage() {
  const navigate = useNavigate();
  const { getAccessToken } = useShellContext();

  return (
    <RecipeEntryForm
      getAccessToken={getAccessToken}
      onSaved={(recipe) => navigate(`/recipes/${recipe.id}`)}
      onCancel={() => navigate('/recipes')}
    />
  );
}
