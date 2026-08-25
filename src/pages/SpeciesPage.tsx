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
import { Separator } from '@/components/ui/separator';
import { Search, Leaf, Calendar, MapPin, AlertTriangle } from 'lucide-react';
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
    { value: 'all', label: t('allTypes'), icon: '🍃' },
    { value: 'mushroom', label: t('mushrooms'), icon: '🍄' },
    { value: 'plant', label: t('plants'), icon: '🌿' },
    { value: 'berry', label: t('berries'), icon: '🫐' },
    { value: 'nut', label: t('nuts'), icon: '🌰' },
    { value: 'flower', label: t('flowers'), icon: '🌸' },
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
          <div className='flex flex-col sm:flex-row gap-4'>
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
            <Select
              value={selectedCategory}
              onValueChange={setSelectedCategory}
            >
              <SelectTrigger className='w-full sm:w-48'>
                <SelectValue placeholder={t('filterByType')} />
              </SelectTrigger>
              <SelectContent>
                {categories.map(category => (
                  <SelectItem key={category.value} value={category.value}>
                    <span className='flex items-center gap-2'>
                      <span>{category.icon}</span>
                      {category.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              <Card
                key={species.id}
                className='hover:shadow-lg transition-shadow duration-[var(--duration-base)] py-6'
              >
                <CardHeader className='pb-3'>
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
                        <Badge
                          variant='outline'
                          className='capitalize flex-shrink-0'
                        >
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
                      <Calendar className='h-4 w-4 text-primary' />
                      <Badge className='bg-secondary text-primary'>
                        {t(`seasons.${species.season}`)}
                      </Badge>
                    </div>
                  )}
                  {species.habitat && (
                    <div className='flex items-center gap-2'>
                      <MapPin className='h-4 w-4 text-success' />
                      <Badge className='bg-secondary text-primary'>
                        {t(`habitats.${species.habitat}`)}
                      </Badge>
                    </div>
                  )}
                </div>

                <CardContent className='space-y-4'>
                  {/* Description */}
                  <div>
                    <p className='text-sm text-muted-foreground leading-relaxed'>
                      {species.description}
                    </p>
                  </div>

                  <Separator />

                  {/* Foraging Instructions */}
                  <div>
                    <div className='flex items-center gap-2 mb-2'>
                      <Leaf className='h-4 w-4 text-success' />
                      <span className='text-sm font-medium text-muted-foreground'>
                        {t('howTo')}
                      </span>
                    </div>
                    <p className='text-sm text-muted-foreground leading-relaxed'>
                      {species.howTo}
                    </p>
                  </div>
                </CardContent>

                {/* Action button - sticky to the card bottom, independent of description length */}
                {species.showOnMap && (
                  <CardFooter className='mt-auto px-6 pt-4'>
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
            <div className='text-6xl mb-4'>🔍</div>
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
