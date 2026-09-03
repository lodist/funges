import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSpeciesData } from '@/data/species';
import SEO from '@/components/SEO';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Leaf,
  Calendar,
  MapPin,
  AlertTriangle,
  List,
  Mushroom,
  Grape,
  Bean,
  Flower2,
} from '@/lib/icons';
import { getSpeciesImage } from '@/lib/utils';
import { Link } from '@tanstack/react-router';
import { Route } from '@/routes/species';

const basePath = import.meta.env.BASE_URL || '/';

export default function SpeciesPage() {
  const { t } = useTranslation('species');
  const speciesData = useSpeciesData();
  const { q } = Route.useSearch();
  const [searchQuery, setSearchQuery] = useState(q ?? '');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    if (q !== undefined) setSearchQuery(q);
  }, [q]);

  // Filter and sort species based on search query and category
  const filteredSpecies = useMemo(() => {
    return speciesData
      .filter(species => {
        const matchesSearch =
          searchQuery === '' ||
          species.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          species.scientificName
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          species.description.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesCategory =
          selectedCategory === 'all' || species.category === selectedCategory;

        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [speciesData, searchQuery, selectedCategory]);

  const categories = [
    { value: 'all', label: t('allTypes'), Icon: List },
    { value: 'mushroom', label: t('mushrooms'), Icon: Mushroom },
    { value: 'plant', label: t('plants'), Icon: Leaf },
    { value: 'berry', label: t('berries'), Icon: Grape },
    { value: 'nut', label: t('nuts'), Icon: Bean },
    { value: 'flower', label: t('flowers'), Icon: Flower2 },
  ];

  return (
    <>
      <SEO
        title={t('title')}
        description={t('description')}
        canonicalUrl={`${import.meta.env.BASE_URL}species`}
      />
      <div className='container mx-auto px-4 py-8 max-w-7xl'>
        {/* Header */}
        <div className='text-center mb-8'>
          <h1 className='text-4xl font-bold text-foreground mb-4'>
            {t('title')}
          </h1>
          <p className='text-lg text-muted-foreground max-w-2xl mx-auto'>
            {t('description')}
          </p>
        </div>

        {/* Search and Filter Controls */}
        <div className='mb-8 space-y-4'>
          <div className='flex flex-col sm:flex-row sm:items-end gap-4'>
            {/* Search Input */}
            <div className='relative flex-1'>
              <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4' />
              <Input
                placeholder={t('search.placeholder')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className='pl-10'
              />
            </div>

            {/* Category Filter */}
            <div className='flex w-full flex-col gap-2 sm:w-auto'>
              <span
                id='species-category-filter'
                className='type-micro text-muted-foreground'
              >
                {t('filterByType')}
              </span>
              <Select
                value={selectedCategory}
                onValueChange={setSelectedCategory}
              >
                <SelectTrigger
                  className='w-full sm:w-48'
                  aria-labelledby='species-category-filter'
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(({ value, label, Icon }) => (
                    <SelectItem key={value} value={value}>
                      <Icon />
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Safety Notes - shown once, above the species grid */}
        <div className='mb-8 bg-status-warning-background border border-status-warning-border rounded-lg p-3'>
          <div className='flex items-start gap-2'>
            <AlertTriangle className='h-4 w-4 text-status-warning-text mt-0.5 flex-shrink-0' />
            <div>
              <p className='text-sm font-medium text-status-warning-text mb-1'>
                {t('safetyNotes')}
              </p>
              <p className='text-xs text-status-warning-text'>
                {t('safetyWarning')}
              </p>
            </div>
          </div>
        </div>

        {/* Species Grid */}
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
          {filteredSpecies.map(species => {
            const speciesImage = getSpeciesImage(species.id);

            return (
              <Card key={species.id}>
                <CardHeader>
                  <div className='flex items-start gap-4'>
                    {/* Species Image */}
                    {speciesImage && (
                      <div className='flex-shrink-0'>
                        <div className='relative w-20 h-20 bg-secondary bg-secondary overflow-hidden rounded-lg'>
                          <img
                            src={speciesImage}
                            alt={species.name}
                            className='w-full h-full object-cover object-center'
                            loading='lazy'
                          />
                          <div className='absolute inset-0 bg-black/10' />
                        </div>
                      </div>
                    )}

                    {/* Title and Scientific Name */}
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-start justify-between'>
                        <div>
                          <CardTitle className='text-lg font-semibold text-foreground'>
                            {species.name}
                          </CardTitle>
                          <p className='text-sm text-muted-foreground italic'>
                            {species.scientificName}
                          </p>
                        </div>
                        <Badge variant='outline' className='capitalize'>
                          {t(`${species.category}`)}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                {/* Season and Habitat - shown right below the photo/header */}
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 px-6 pb-4'>
                  {species.season && (
                    <div className='flex items-center gap-2'>
                      <Calendar className='h-4 w-4 text-primary-text' />
                      <Badge variant='secondary'>
                        {t(`seasons.${species.season}`)}
                      </Badge>
                    </div>
                  )}
                  {species.habitat && (
                    <div className='flex items-center gap-2'>
                      <MapPin className='h-4 w-4 text-success' />
                      <Badge variant='secondary'>
                        {t(`habitats.${species.habitat}`)}
                      </Badge>
                    </div>
                  )}
                </div>

                <CardContent className='space-y-6'>
                  {/* Description */}
                  <div>
                    <p className='text-sm text-muted-foreground leading-relaxed'>
                      {species.description}
                    </p>
                  </div>

                  {/* Foraging Instructions */}
                  <div>
                    <div className='flex items-center gap-2 mb-2'>
                      <Leaf className='h-4 w-4 text-success' />
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        {t('howTo')}
                      </h4>
                    </div>
                    <p className='text-sm text-muted-foreground leading-relaxed'>
                      {species.howTo}
                    </p>
                  </div>
                </CardContent>

                {/* Action button - sticky to the card bottom, independent of description length */}
                {species.showOnMap && (
                  <CardFooter className='mt-auto px-6'>
                    <Button
                      asChild
                      className='w-full flex items-center justify-center gap-2'
                    >
                      <Link to={`${basePath}`} search={{ species: species.id }}>
                        <MapPin className='h-4 w-4' />
                        {t('viewOnMap')}
                      </Link>
                    </Button>
                  </CardFooter>
                )}
              </Card>
            );
          })}
        </div>

        {/* Empty State */}
        {filteredSpecies.length === 0 && (
          <div className='text-center py-12'>
            <Search className='mx-auto mb-4 size-12 text-muted-foreground' />
            <h3 className='text-xl font-semibold text-foreground mb-2'>
              {t('noResults')}
            </h3>
            <p className='text-muted-foreground mb-4'>
              {t('noResultsDescription')}
            </p>
            <Button
              variant='outline'
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
            >
              {t('search.clear')}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
