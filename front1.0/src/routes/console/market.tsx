import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ShoppingCart, 
  TrendingUp, 
  Package, 
  Leaf, 
  Plus, 
  Search, 
  Filter, 
  ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/console/market")({
  component: MarketPage,
});

// Mock Data
const MOCK_CREDITS = [
  { id: "c1", seller: "Farm Alpha (Ver. ID: FA-923)", amount: 500, price: 25.5, status: "verified" },
  { id: "c2", seller: "Aqua Harvest Ltd.", amount: 1200, price: 24.8, status: "verified" },
  { id: "c3", seller: "BioGrow Ponds", amount: 350, price: 26.0, status: "pending" },
];

const MOCK_PRODUCTS = [
  { id: "p1", name: "Spirulina Biomass (Raw)", seller: "Farm Alpha", quantity: "500 kg", price: 15.0 },
  { id: "p2", name: "Chlorella Extract", seller: "BioGrow Ponds", quantity: "200 L", price: 45.5 },
  { id: "p3", name: "Algal Fertilizer Blend", seller: "Aqua Harvest Ltd.", quantity: "1000 kg", price: 8.0 },
];

function MarketPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isListing, setIsListing] = useState(false);

  return (
    <div className="relative min-h-[calc(100vh-64px)] w-full overflow-hidden bg-background p-6 lg:p-12">
      {/* Decorative background glows */}
      <div className="absolute top-0 right-0 size-[500px] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 size-[500px] rounded-full bg-accent/10 blur-[120px] pointer-events-none" />
      
      <div className="relative z-10 mx-auto max-w-6xl space-y-8">
        
        {/* Header section */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">Global Marketplace</h1>
            <p className="mt-2 text-base text-muted-foreground max-w-2xl">
              Trade verified carbon credits and premium algae products directly. Fast, secure, and transparent.
            </p>
          </div>

          <Dialog open={isListing} onOpenChange={setIsListing}>
            <DialogTrigger asChild>
              <Button className="h-12 gap-2 rounded-xl text-base px-6 shadow-lg shadow-primary/20 transition-all hover:scale-105 hover:shadow-primary/30">
                <Plus className="size-5" />
                List New Item
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] rounded-2xl bg-card/95 backdrop-blur-xl border-border/50">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">Create Listing</DialogTitle>
                <DialogDescription>
                  Enter the details of the credits or products you wish to sell on the market.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="type">Listing Category</Label>
                  <select id="type" className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                    <option value="credit">Carbon Credits</option>
                    <option value="product">Algae Product</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="itemName">Item Name</Label>
                  <Input id="itemName" placeholder="e.g. Premium Spirulina Extract" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ownerName">Owner / Company Name</Label>
                  <Input id="ownerName" placeholder="e.g. BioGrow Ponds Ltd." />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="amount">Amount / Quantity</Label>
                  <Input id="amount" placeholder="e.g. 500 kg" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="price">Price per unit (USD)</Label>
                  <Input id="price" placeholder="e.g. 25.50" />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsListing(false)}>Cancel</Button>
                <Button onClick={() => setIsListing(false)}>List on Market</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { label: "24h Volume (Credits)", value: "12,450 tCO2e", trend: "+14%", positive: true },
            { label: "Avg Credit Price", value: "$25.80", trend: "+2.4%", positive: true },
            { label: "Active Listings", value: "843", trend: "-5", positive: false },
          ].map((stat, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-md p-6 shadow-sm"
            >
              <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
              <div className="mt-2 flex items-baseline gap-3">
                <h3 className="font-display text-3xl font-bold">{stat.value}</h3>
                <span className={`text-xs font-semibold ${stat.positive ? "text-status-optimal" : "text-status-warning"}`}>
                  {stat.trend}
                </span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Market Tabs & Listings */}
        <Tabs defaultValue="credits" className="w-full">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-card/30 backdrop-blur-sm p-2 rounded-2xl border border-border/50">
            <TabsList className="bg-transparent gap-2 h-12">
              <TabsTrigger value="credits" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-xl px-6 font-medium">
                <TrendingUp className="mr-2 size-4" /> Carbon Credits
              </TabsTrigger>
              <TabsTrigger value="products" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-xl px-6 font-medium">
                <Package className="mr-2 size-4" /> Algae Products
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2 w-full sm:w-auto px-2 pb-2 sm:pb-0">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input 
                  placeholder="Search listings..." 
                  className="pl-9 bg-background/50 border-border/50 rounded-xl"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button variant="outline" size="icon" className="rounded-xl border-border/50">
                <Filter className="size-4" />
              </Button>
            </div>
          </div>

          <TabsContent value="credits" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {MOCK_CREDITS.map((credit, idx) => (
                  <motion.div
                    key={credit.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    className="group relative rounded-2xl border border-border/50 bg-card/60 backdrop-blur-xl p-6 shadow-sm transition-all hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                          <Leaf className="size-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground text-sm">{credit.seller}</p>
                          <p className="text-xs text-muted-foreground">Verified by RTZ Oracle</p>
                        </div>
                      </div>
                      <span className="rounded-full bg-status-optimal/20 px-2.5 py-0.5 text-xs font-semibold text-status-optimal">
                        {credit.status.toUpperCase()}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-end mt-8">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Volume</p>
                        <p className="font-display text-2xl font-bold">{credit.amount} <span className="text-sm font-normal text-muted-foreground">tCO2e</span></p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Price</p>
                        <p className="font-display text-2xl font-bold text-primary">${credit.price}</p>
                      </div>
                    </div>
                    
                    <Button className="w-full mt-6 gap-2 rounded-xl group-hover:bg-primary/90">
                      <ShoppingCart className="size-4" /> Buy Credits
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </TabsContent>

          <TabsContent value="products" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {MOCK_PRODUCTS.map((product, idx) => (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    className="group relative rounded-2xl border border-border/50 bg-card/60 backdrop-blur-xl p-6 shadow-sm transition-all hover:shadow-lg hover:shadow-accent/5 hover:-translate-y-1"
                  >
                    <div className="mb-4">
                      <p className="font-display text-lg font-bold text-foreground">{product.name}</p>
                      <p className="text-sm text-muted-foreground mt-1">Sold by {product.seller}</p>
                    </div>
                    
                    <div className="flex justify-between items-end mt-8">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Available</p>
                        <p className="font-display text-xl font-bold">{product.quantity}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Price / unit</p>
                        <p className="font-display text-xl font-bold text-accent">${product.price}</p>
                      </div>
                    </div>
                    
                    <Button variant="secondary" className="w-full mt-6 gap-2 rounded-xl group-hover:bg-secondary/80">
                      <ShoppingCart className="size-4" /> Purchase Product
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}
