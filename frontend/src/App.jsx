import { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import Service13 from './components/Service13';
import AboutSection from './components/AboutSection';
import FAQSection from './components/FAQ';
import Footer from './components/Footer';
import Loader from './components/Loader';
import './global.css';

function App() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // This simulates waiting for critical assets to load
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 3000); // 3 second delay for demo

    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      {isLoading ? (
        <Loader />
      ) : (
        <>
          <Navbar />
          <HeroSection id="home" />
          <Service13 id="services" />
          <AboutSection id="about" />
          <FAQSection id="faq" />
          <Footer id="contact" />
        </>
      )}
    </>
  );
}

export default App;